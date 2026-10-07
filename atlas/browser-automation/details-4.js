// Details for the browser automation plate, part 4: flakiness, bot detection, scale, cross-cutting concerns.
ATLAS.details("browser-automation", {
  "timing-races": {
    s: "Failures caused by a script acting before the page is ready or after it has changed, the most common source of intermittent browser test failures.",
    d: "The script and the page run concurrently. A click can land before a handler is attached, an assertion can read text before the update, and a response can arrive before the listener exists. Auto-waiting closes many races, but not those involving data or state not visible in the element, such as a handler attached after rendering. Races depend on machine speed, so they pass locally and fail on a loaded CI worker. Diagnosis requires traces with timestamps and runs under artificial slowdown.",
    k: ["Waiting on observable state vs sleeping: observable state is exact and requires finding the right signal; sleeping is easy and wrong on every machine except one.", "Slowing the page to expose races vs running normally: slowdown finds bugs early and adds a special mode; normal runs are quicker and find them by accident."],
    p: ["A fixed sleep added to silence one race moves the failure to a slower machine.", "A button that is visible but whose handler is attached later, so a click does nothing."],
    v: "Run the suite with CPU throttled to a quarter speed and network latency added. Tests that fail only under slowdown point to races to fix, and the number should reach zero.",
    dep: ["auto-waiting", "explicit-waits", "timing-model", "trace-recording"]
  },
  "animation-stability": {
    s: "Making visual movement predictable, through disabling animations, waiting for stable boxes and masking moving regions, so that input and screenshots hit settled layout.",
    d: "Animations and transitions change element positions for hundreds of milliseconds, so a click can land where the element was. Frameworks wait for a stable bounding box across frames before acting, and screenshot options can disable CSS animations, finish transitions and hide carets. Infinite animations such as spinners or carousels never settle and must be masked or paused. Page scripts that animate with timers rather than CSS are invisible to these helpers, and reduced motion preferences are the most reliable lever when the app respects them.",
    k: ["Disabling animations globally vs testing with them: disabling removes a whole class of flakes and skips the animated path; testing with them is faithful and flaky.", "Waiting for stability vs forcing the action: waiting is correct and slower; forcing is fast and clicks wrong places."],
    p: ["A carousel advancing during a screenshot gives a different image each run.", "Disabling animations also disables the end-of-transition events the app waits on, so its UI never reaches the final state."],
    v: "Screenshot a page with a looping spinner twenty times with animation control on. All images must be identical, and clicking an element mid-slide must land on its final position.",
    dep: ["actionability-checks", "media-emulation", "screenshots"]
  },
  "shared-state-collisions": {
    s: "Failures where parallel or sequential tests interfere through shared server data, accounts, files or ports, even though each browser context is isolated.",
    d: "Two tests that edit the same user, claim the same inventory or rely on an empty list pass alone and fail together. The browser isolates client state, not the backend. Solutions are unique data per test, per-worker accounts or tenants, transactional resets, and ordering constraints. Failures look random because they depend on worker scheduling, and the symptom, such as an unexpected row, often appears far from the cause. Even file system paths and local ports collide when several suites share a host.",
    k: ["Unique data per test vs resetting the environment between tests: unique data allows full parallelism and needs generators and cleanup; resets are simple and serialize runs.", "Per-worker accounts vs a shared one: per-worker is safe and costs provisioning; shared is easy and leads to conflicts."],
    p: ["Tests assert that a list contains exactly three items, and another worker adds a fourth.", "Cleanup that deletes by broad criteria removes another running test's data."],
    v: "Run the suite with the worker count raised from 1 to 8 and then reorder the tests randomly. Results must be identical across all runs.",
    dep: ["per-test-isolation", "worker-pool", "storage-state"]
  },
  "third-party-noise": {
    s: "Instability introduced by content the team does not control, such as ads, analytics, chat widgets, consent banners and embedded maps, that loads slowly, fails or moves the layout.",
    d: "Third-party scripts load at unpredictable times, open overlays, steal focus and throw errors. Defenses: block their domains through interception, stub them with local fakes, dismiss banners through pre-seeded cookies, and keep them out of assertions on console errors. Testing against live third parties makes the suite depend on their uptime and their changes. A banner that appears in one region only, or an experiment variant, makes a test environment differ from the person who wrote the test.",
    k: ["Blocking third parties vs letting them load: blocking is fast and stable and tests a page users never see; loading is faithful and fragile.", "Pre-seeding consent state vs clicking the banner: seeding is quick and skips the banner path; clicking tests it and fails when the banner varies."],
    p: ["A consent banner covers the target in one region only, so tests fail only in CI.", "An analytics script that never finishes loading prevents the network idle condition."],
    v: "Block every non-first-party host and run the suite. It must pass, then enable one third party at a time to find which ones change results.",
    dep: ["request-interception", "console-and-error-capture", "storage-state"]
  },
  "environment-drift": {
    s: "Differences between machines and runs, in browser version, fonts, locale, CPU speed, memory and network, that change test outcomes without any code change.",
    d: "A suite passes on a laptop and fails in CI because of an older browser, missing fonts, a different locale, slower disks or lower memory. Defenses are pinned browser builds, identical container images for local and CI, fixed locale, timezone and viewport, and resource limits that match. Drift also arrives over time through base image updates, operating system patches and updated dependencies. Detecting it needs the environment recorded with each run, so that a change in results can be traced to a change in the environment.",
    k: ["Containerized pinned environment vs the developer's machine: containers are reproducible and add a workflow step; native runs are quick and differ.", "Updating dependencies on a schedule vs on demand: scheduled updates keep drift small and regular; on demand lets it accumulate."],
    p: ["A base image update changes system fonts and breaks every screenshot baseline at once.", "Tests tuned to pass on fast machines fail on shared runners with fewer cores."],
    v: "Record the browser version, image digest, locale, timezone and CPU count in each run's report. After a failure, diff these against the last passing run and name the differing field.",
    dep: ["container-images", "browser-discovery", "resource-limits", "locale-and-timezone"]
  },
  "flake-triage": {
    s: "The process of detecting, measuring, assigning and fixing intermittent failures, using rerun statistics, history and traces to find root causes instead of rerunning until green.",
    d: "Detection reruns failures and records tests that both pass and fail on the same code. Dashboards track flake rate per test over time and per environment. Triage reads the trace of a failing attempt and classifies the cause: race, data collision, third-party, environment or product bug. The practice that makes it work is ownership with a deadline: each flaky test has an owner and a quarantine date. Without it, flake rate rises until the suite is ignored, which is worse than not having one.",
    k: ["Fix flakes immediately vs batch them: immediate fixes stop erosion of trust and interrupt feature work; batching is efficient and lets noise grow.", "Rerun-to-confirm vs trace-first diagnosis: reruns measure rate cheaply; traces explain cause and need artifacts from the failing run."],
    p: ["Flakes reported only as aggregate rate with no per-test history cannot be assigned to anyone.", "A product defect that fails one time in twenty is dismissed as test flakiness."],
    v: "Run a test 200 times in the CI environment. Its pass rate, the causes of each failure from traces, and the owner of the fix must be in the report, with a 100 percent pass rate after the fix.",
    dep: ["retries-and-quarantine", "trace-recording", "reporters", "timing-races"]
  },
  "browser-fingerprinting": {
    s: "Identifying a browser by the combination of its properties, such as user agent, screen, fonts, graphics output and installed features, which automation environments often render unusually.",
    d: "A site script collects values from many APIs: navigator fields, screen metrics, supported media codecs, canvas and audio output, font lists, timezone and language. The combination is hashed or fed into a model. Headless and containerized browsers often show a software renderer, missing fonts, and inconsistent values between user agent and platform fields. Defense is consistency, since a plausible environment passes and a contradictory one stands out. Sites use these signals for fraud and abuse prevention as well as for blocking scrapers.",
    k: ["Collecting many signals vs few robust ones: many signals separate bots well and raise false positives on unusual people; a few are simple and easy to spoof.", "Static fingerprint checks vs continuous scoring: static checks are cheap at page load; continuous scoring catches changes mid-session and costs more."],
    p: ["Spoofing a single value, such as the user agent, creates an inconsistency that flags the session more than the original value did.", "A software graphics renderer in a container is a stable bot signal that persists across many patches."],
    v: "Run a fingerprint-reporting page in your own environment and list every field that differs from a typical consumer browser. Fix the inconsistencies and see which fields remain different.",
    dep: ["automation-signals", "device-descriptors", "headless-modes"]
  },
  "automation-signals": {
    s: "Explicit and implicit markers that a browser is under remote control, such as a webdriver flag, injected helper objects, debugging port presence and unusual permission or plugin states.",
    d: "The automation standard requires a navigator property that announces control. Control protocols may leave injected scripts, extra globals, or differences in how events are trusted. Headless modes historically differed in plugin lists, window dimensions and permission behavior. A site checks these and combines them with other signals. Frameworks have reduced the obvious markers, and new ones appear when engines change. Removing a marker by patching introduces its own detectable artifacts, such as a function whose source text no longer looks native.",
    k: ["Hiding markers by patching page APIs vs using a real, unmodified browser: patching is cheap and detectable; a real browser is faithful and heavier.", "Reporting automation honestly vs masking it: honesty respects site terms and gets blocked; masking is contested and often violates terms."],
    p: ["A patch applied after page scripts begin running misses early checks.", "Overridden properties show a different property descriptor than genuine ones."],
    v: "Open a page that reports automation markers, with default settings, and list each one. Record which markers remain after each configuration change and whether a plain manual browser shows none.",
    dep: ["execution-contexts", "headless-modes", "bidirectional-standard"]
  },
  "behavior-analysis": {
    s: "Classifying sessions by how the pointer, keyboard, scroll and navigation behave over time, since scripts move in straight lines, click instantly and never pause.",
    d: "A site records mouse paths, event timing, key intervals, scroll patterns and page sequences, and scores them against human distributions. Synthetic input generated at fixed intervals or teleporting between coordinates stands out. Counter-measures add randomized timing and curved paths, which an adversary can learn to recognize. The same analysis detects legitimate high-speed use, such as accessibility tools and password managers, which produces false positives that harm real users.",
    k: ["Behavioral scoring vs static checks: behavior catches adaptive bots and needs data and tuning; static checks are cheap and easy to evade.", "Humanizing input vs accepting detection: humanizing may pass and slows scripts; accepting detection keeps tests fast on environments where detection is off."],
    p: ["Perfectly regular intervals between events are a stronger signal than any single header.", "Assistive technology users are classified as bots because their input has no pointer movement."],
    v: "Record the event stream your script produces on a test page, plot timing and path, and compare with a manual session. Differences identify what a scorer would see.",
    dep: ["input-synthesis", "browser-fingerprinting"]
  },
  "challenge-pages": {
    s: "Interstitial checks, such as interactive puzzles or automatic browser verification, that a site serves to uncertain visitors before showing content.",
    d: "When a score is ambiguous, the site serves a page that runs a script to test the browser, or asks the visitor to solve a puzzle, then sets a cookie that grants access for a period. Automated solving of puzzles is a bypass of an access control and is against most terms of service. For tests of your own site, the right fix is an environment-specific allowlist or a bypass token for test traffic. For third-party sites, a challenge is a signal to stop or ask for permission.",
    k: ["Disabling challenges for test traffic vs testing them: disabling keeps suites stable and leaves the challenge path untested; testing needs a dedicated environment.", "Stopping at a challenge vs attempting to solve it: stopping respects the site's decision; solving is an arms race and often prohibited."],
    p: ["A bypass token left in production configuration weakens the site's protection.", "A challenge cookie expires mid-run and the suite fails from that point on."],
    v: "In a staging environment, send a request flagged as test traffic and confirm no challenge is served. Send the same request unflagged and confirm the challenge is served.",
    dep: ["site-terms-and-ethics", "ip-reputation", "security-and-secrets"]
  },
  "ip-reputation": {
    s: "Scoring visitors by the address they come from, where data center, proxy and previously abusive ranges are treated with more suspicion than residential connections.",
    d: "Sites consult lists and reputation data for address ranges, ownership type and past behavior. Cloud CI runners and shared proxies fall in suspicious ranges, and heavy traffic from one address raises rates and blocks. Test suites against your own site are best served by allowlisting the runner's address range. Scrapers face blocks they cannot fix with browser changes; the legitimate remedies are lower request rates, identifying themselves honestly, and asking for access or an API.",
    k: ["Rotating addresses vs a fixed identified address: rotation spreads load and evades limits the site set on purpose; a fixed address with a contact is transparent and easy to block.", "Allowlisting test runners vs testing from anywhere: allowlisting is stable and hides what real users see; testing from anywhere is realistic and flaky."],
    p: ["A shared runner address is blocked because another tenant abused the same range.", "Rotating addresses mid-session invalidates sessions bound to the first address."],
    v: "Send the same request from a runner address and from a residential connection and compare the responses. Add the runner range to the allowlist and confirm the difference disappears.",
    dep: ["proxy-configuration", "rate-limiting", "site-terms-and-ethics"]
  },
  "transport-fingerprints": {
    s: "Identifying clients by how they negotiate TLS and HTTP, such as cipher order, extensions, header order and frame settings, which differ between real browsers and simple HTTP clients.",
    d: "A server or edge network hashes the TLS handshake parameters and HTTP/2 settings and compares them to known browsers. A real browser driven by automation has the genuine fingerprint, since it uses the browser's own network stack, which is one reason to drive a real browser rather than an HTTP library. Mismatches appear when a client claims a browser identity in headers but negotiates like a library. Fingerprints change with browser versions, so lists need constant updating.",
    k: ["Using a real browser vs an HTTP client with a spoofed identity: a real browser has an authentic transport fingerprint and costs memory; spoofed clients are cheap and drift from the real handshake.", "Fingerprinting at the edge vs the application: edge checks block early and cheaply; application checks have richer context."],
    p: ["A headers-only identity change on a library client is flagged immediately because its handshake does not match.", "An older bundled browser has a fingerprint no longer in the list of current browsers."],
    v: "Capture the handshake hash of your automated browser and a normal install of the same version and confirm they match. Compare with a plain HTTP client and confirm they differ.",
    dep: ["process-launch", "browser-fingerprinting", "ip-reputation"]
  },
  "stealth-patches": {
    s: "Scripts and settings that alter the browser's visible properties to look less automated, and the reasons they work partially, age quickly and carry legal and ethical limits.",
    d: "Patches override navigator properties, fix plugin lists, spoof graphics strings and normalize permission responses before page scripts run. Each patch is a guess about what detectors check, and detectors then check the patch itself: property descriptors, stack traces and timing of the overridden calls. Gains are temporary and require upkeep with each browser release. Using them against a site's terms may breach its rules or the law in some places, so they are never a substitute for permission or an official interface.",
    k: ["Maintaining patches vs asking for an API or permission: patches work for a while and need constant upkeep; an official route is stable and requires agreement.", "Generic patches vs per-site tuning: generic patches are reusable and catch the common checks; per-site tuning goes deeper and does not transfer."],
    p: ["A patch that makes a function look native in one check exposes it in another that inspects the call stack.", "Patches shared publicly are fingerprinted by the very vendors they target within weeks."],
    v: "Run a detection test page before and after applying patches and record which signals changed. Repeat after the next browser release and see which fixes survive.",
    dep: ["automation-signals", "browser-fingerprinting", "execution-contexts", "site-terms-and-ethics"]
  },
  "worker-pool": {
    s: "A fixed number of worker processes, each running tests or crawl jobs against its own browser, fed from a shared queue.",
    d: "The runner starts N workers, assigns them test files or jobs, and restarts a worker that crashes. Each worker owns a browser and creates contexts per test. N is bounded by memory and CPU: each browser tree costs hundreds of megabytes, and rendering is CPU heavy, so the best number is usually below the core count. A failing worker has to return its unfinished work to the queue. Order of execution changes with scheduling, which exposes tests that depend on one another.",
    k: ["Many workers vs fewer fast ones: many shorten wall time until contention makes every test slower and flakier; fewer are steadier.", "Worker-per-file vs worker reuse across files: reuse saves browser startups and carries state across files; per-file is clean and slower."],
    p: ["Setting workers to the core count starves browsers of CPU, and timeouts appear.", "A worker killed by out-of-memory reports no results for the tests it was running."],
    v: "Run the suite with 1, 2, 4 and 8 workers on the CI machine. Plot duration and flake rate; choose the point after which duration stops falling or failures rise.",
    dep: ["browser-contexts", "resource-limits", "shared-state-collisions"]
  },
  "sharding": {
    s: "Splitting a suite into slices that run on different machines at once, then merging their results into one report.",
    d: "A deterministic split assigns tests to shards by file, by count or, better, by historical duration so shards finish together. Each shard runs the same build against its slice, and a merge step combines reports, traces and coverage. Splitting by file count alone leaves one shard with the slowest tests and the whole run waits for it. Shards must be independent, since they run at the same time against shared backends, and a failed shard must be re-runnable without the others.",
    k: ["Splitting by duration history vs by count: duration balances the finish time and needs stored timings; count is simple and unbalanced.", "Static assignment vs dynamic queue: static is predictable and wastes idle machines; a dynamic queue balances automatically and needs coordination."],
    p: ["Merging reports by test name loses results when two shards each run a test of the same name.", "One slow file in one shard defines total wall time."],
    v: "Run a suite as 1 shard and as 4. Merged results must contain the same test set and statuses, and the four shards' durations must be within about 15 percent of each other.",
    dep: ["worker-pool", "reporters", "artifact-collection"]
  },
  "container-images": {
    s: "Prebuilt images containing pinned browsers, their system libraries, fonts and the test runner, so every run starts from the same filesystem.",
    d: "An image includes the browser binaries matched to the framework version, shared libraries, a font set, a display or headless support and a non-privileged user. It is versioned and pinned by digest. Using the image locally and in CI removes most environment drift. Sandboxing needs kernel features the container may not grant, so flags change. Images are large, and build caching and distribution time matter at scale. A rendering baseline is valid only for the image that produced it.",
    k: ["One shared image vs per-project images: shared is easier to maintain and ties projects to one browser version; per-project fits each team and multiplies maintenance.", "Rebuilding often vs pinning for months: frequent rebuilds track security fixes and move baselines; pinning is stable and ages."],
    p: ["Missing system fonts or libraries cause blank text or crashes only inside containers.", "A shared memory limit too small for the browser crashes pages on heavy sites."],
    v: "Run the same test in two builds of the image from the same definition. The screenshot hashes must match, and the image digest must appear in the run record.",
    dep: ["browser-discovery", "resource-limits", "environment-drift"]
  },
  "remote-grid": {
    s: "A service that hands out browser sessions on demand from a pool of machines, so tests run anywhere while the browsers live in a managed fleet.",
    d: "A hub receives session requests with desired capabilities such as browser and version, finds a node with a free slot, starts a browser there and proxies protocol traffic. Sessions have idle and total time limits. Fleets are autoscaled on queue depth, and nodes recycle after a number of sessions to avoid memory growth. Hosted grids add many browser and device combinations. The control path now crosses the network, so latency, dropped connections and authentication must be handled, and artifacts must be fetched from nodes.",
    k: ["Self-hosted grid vs hosted service: self-hosted gives control of data and costs operations work; hosted offers breadth and sends traffic and credentials to a third party.", "Long-lived nodes vs fresh node per session: long-lived is fast and accumulates state; fresh is clean and slow to start."],
    p: ["A queue of sessions waiting for slots makes a test fail from a start timeout, not from a defect.", "Nodes that are never recycled slow down as processes and cache accumulate."],
    v: "Request 50 simultaneous sessions from a 10-slot grid. Confirm requests queue and complete in order, no session exceeds its time limit, and node count scales up and back down.",
    dep: ["remote-connect", "transports", "resource-limits", "container-images"]
  },
  "resource-limits": {
    s: "Caps on memory, CPU, processes and open files per browser and per worker, plus timeouts, that keep one runaway page from taking down a shared machine.",
    d: "Browsers use a process per site or tab, plus GPU and utility processes, so a single page can run into several hundred megabytes, and heavy sites more. Limits come from the container runtime or operating system: memory ceilings, CPU shares, process counts and shared memory size. When a limit is hit, the process is killed, often without a clear message to the framework. Tuning requires measuring peak memory per test under real load, and leaving headroom for the runner itself.",
    k: ["Tight limits vs generous ones: tight limits catch leaks and fail more tests when a page legitimately needs memory; generous ones are stable and let one bad page hurt neighbors.", "Limiting per worker vs per machine: per worker isolates failures and wastes headroom; per machine uses capacity and spreads the damage."],
    p: ["An out-of-memory kill appears as a protocol connection error with no hint about memory.", "A page with an infinite loop consumes a whole core until the global timeout."],
    v: "Load a page that allocates memory without bound. The browser must be terminated at the limit, the test must fail with a clear resource error, and other workers on the machine must keep running.",
    dep: ["worker-pool", "shutdown-and-cleanup", "process-launch"]
  },
  "artifact-collection": {
    s: "Gathering traces, videos, screenshots, logs and downloads from every worker and machine into one place, with naming, retention and size limits.",
    d: "Each test writes artifacts to a per-test directory. After the run, a step copies them to durable storage, indexes them by run, shard, project and test, and links them from the report. Remote nodes require fetching files from the machine that produced them before it is recycled. Retention rules delete old artifacts. Sensitive content such as credentials in traces and videos needs scrubbing or restricted access. The volume can be large, so policies decide which tests keep which artifacts.",
    k: ["Keep artifacts for failures only vs for everything: failures-only saves storage and loses a passing baseline for comparison; everything is complete and costly.", "Uploading during the run vs after: during means partial data survives a crash; after is simpler and loses what a killed machine held."],
    p: ["Node is recycled before artifacts are fetched, and the evidence for a failure is gone.", "Artifacts uploaded to a shared location expose secrets captured in traces."],
    v: "Fail a test on one of four shards and open the report from the central store. It must link to that test's trace, video and logs, which must still be present after the shard's machine is destroyed.",
    dep: ["reporters", "trace-recording", "security-and-secrets"]
  },
  "timing-model": {
    s: "The cross-cutting decision of how the framework represents waiting: implicit in actions, explicit in scripts, or both, and which timeouts apply at each level.",
    d: "Every layer waits for something: the launcher for readiness, actions for actionability, navigation for load, assertions for state, tests for completion. A consistent model gives each wait a named condition and a timeout budget that nests, so an inner wait cannot outlast the outer one. Poor models mix fixed sleeps, global implicit waits and unbounded polling, and produce suites where timing failures are blamed on the wrong layer. The model also decides what a failure message says: which condition, which element, how long.",
    k: ["Implicit waiting everywhere vs explicit conditions: implicit keeps scripts short and hides what is awaited; explicit is clear and verbose.", "One large timeout vs a budget per layer: one is simple and delays every failure; layered budgets localize failures and need tuning."],
    p: ["Stacked timeouts where the action wait exceeds the test timeout, so the test is killed with a generic message.", "Different timeout defaults per layer that no one remembers cause failures at surprising times."],
    v: "Make an element never appear and read the failure: it must name the condition, the locator, the time waited and the timeout that applied, and the test must fail in under its own budget.",
    dep: ["auto-waiting", "explicit-waits", "retrying-assertions"]
  },
  "isolation-boundaries": {
    s: "The cross-cutting decision of where one run's state ends and another's begins: process, browser, context, page, profile, backend data and machine.",
    d: "Stronger boundaries cost more: a new machine is clean and slow, a new context is clean for client state and cheap, a new page shares the context's cookies. Each boundary protects from a specific kind of leak and none protects from all. Client state is solved by contexts, server state by unique data or resets, shared infrastructure by separate environments. Choosing the boundary per test type, rather than one for all, balances cost and confidence. Security is a different boundary, since a context does not contain hostile pages.",
    k: ["Strong isolation by default vs shared state for speed: strong isolation gives independent tests and costs startup time; sharing is fast and couples results.", "Isolating client only vs client and server: client isolation is built in; server isolation needs design and gives true independence."],
    p: ["Treating a context as a security boundary when running untrusted pages.", "Isolating the browser and forgetting the database, so parallel tests collide."],
    v: "List each kind of state a test can write, and for each name the boundary that resets it. Run two tests that write every kind in parallel and confirm neither sees the other's writes.",
    dep: ["browser-contexts", "per-test-isolation", "shared-state-collisions"]
  },
  "browser-version-coupling": {
    s: "The cross-cutting decision of how tightly the framework is tied to specific browser builds, given that its protocol and behavior change with every browser release.",
    d: "Frameworks that bundle a browser version test against exactly what they verified; frameworks driving the user's browser follow its updates and break unpredictably. Protocol methods, headless behavior, default flags and even rendering change across versions. Pinning gives reproducibility and delays security fixes and real-world coverage, and testing across several versions finds compatibility bugs at cost. A written policy for upgrading, with a canary job on the next version, avoids both stagnation and surprises.",
    k: ["Bundled pinned browser vs the installed one: bundled is stable and ages; installed tracks users and moves under the suite.", "Testing only the pinned version vs also the next: pinned alone is cheap and finds breakage late; a canary job finds it before the upgrade."],
    p: ["A silent browser auto-update breaks tests on one machine and not others.", "A pinned browser misses a rendering bug that real users hit after their update."],
    v: "Run the suite on the pinned version and on the next release in a canary job. Report which tests differ, and confirm the canary does not block merges.",
    dep: ["browser-discovery", "protocol-bindings", "debugging-protocol"]
  },
  "observability-by-default": {
    s: "The cross-cutting decision to record traces, logs and artifacts routinely, so failures in remote, headless runs can be diagnosed without being reproduced.",
    d: "A headless browser on a remote machine cannot be watched, so evidence must be captured before it is needed. Recording everything costs storage and a little speed; recording nothing makes intermittent failures unfixable. Typical policy is lightweight logging always, traces on first retry, and video or full tracing in a debugging mode. Observability spans layers: action logs from the API, events from the protocol, console output from the page and process logs from the browser. It must also respect secrets that these records can capture.",
    k: ["Record always vs record on failure: always gives complete history and costs storage and speed; on-failure is cheap and has nothing for the first occurrence.", "Rich traces vs plain logs: traces answer what the page looked like and are heavy; logs are small and answer less."],
    p: ["Tracing enabled only on retry means a failure that passes on retry leaves no evidence.", "Logs without timestamps and worker ids cannot be correlated across shards."],
    v: "Pick a failure from last week's runs and, from stored artifacts alone, state which step failed, what the page showed and what network calls preceded it.",
    dep: ["trace-recording", "console-and-error-capture", "artifact-collection"]
  },
  "security-and-secrets": {
    s: "The cross-cutting decision on how credentials, tokens, session files and recorded traffic are stored, scoped and kept out of logs, artifacts and the browser's reach.",
    d: "Automation holds real credentials: logins, API tokens, stored sessions, proxy passwords. They appear in environment variables, state files, traces, videos, HAR files and screenshots. Practices are scoped test accounts with least privilege, secrets from a store and not the repository, masking in logs, short-lived tokens, restricted artifact access and treating state files as passwords. The browser itself is a risk: pages visited by a scraper are untrusted code, a debugging port is full control, and disabled sandboxes remove protections.",
    k: ["Dedicated test accounts vs real accounts: dedicated ones limit damage and need provisioning; real accounts are convenient and risk real data.", "Scrubbing artifacts vs restricting access: scrubbing keeps sharing safe and may remove useful evidence; restricting keeps evidence and shrinks the audience."],
    p: ["A trace uploaded to a public build page contains a bearer token.", "A debugging port left open to the network gives anyone full control of a logged-in browser."],
    v: "Search all stored artifacts from one run for the test account's password and tokens. None should appear in plain form, and the debugging port must not accept connections from another machine.",
    dep: ["storage-state", "har-recording", "transports"]
  },
  "site-terms-and-ethics": {
    s: "The cross-cutting decision about what automation is allowed to do to a site: respect terms, access rules and load limits, and prefer an official interface or permission over evasion.",
    d: "Testing your own site is yours to decide. Automating someone else's site is governed by their terms of service, access controls, crawl rules and laws about unauthorized access, personal data and copyright. Good practice identifies the client, honors crawl rules and rate limits, avoids personal data, stops at login walls and challenges unless permitted, and uses an API or a data agreement where one exists. Bot-detection countermeasures are in tension with these, and a team should decide in advance where it stops.",
    k: ["Stopping at access controls vs working around them: stopping respects the site's decision and may end the project; working around is possible and risks legal and reputational harm.", "Honest identification vs blending in: identification is transparent and invites blocks; blending in avoids blocks and defeats the owner's controls."],
    p: ["A scraper that works for months is discovered and the whole data pipeline is lost, along with a contractual relationship.", "Collected personal data is retained without a legal basis."],
    v: "For each external site automated, show the written basis for access: terms checked, crawl rules honored, rate agreed or API used, and the date reviewed.",
    dep: ["rate-limiting", "challenge-pages", "stealth-patches"]
  }
});
