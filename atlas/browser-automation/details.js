// Details for the browser automation plate, part 1: test runner, scraping, locators.
ATLAS.details("browser-automation", {
  "test-runner-hooks": {
    s: "The glue that lets a general test runner start browsers, hand each test a page, and collect results, so tests are ordinary functions with browser objects passed in.",
    d: "The automation library either ships its own runner or plugs into an existing one through setup and teardown hooks. The runner discovers test files, decides which run in which worker, injects browser objects through arguments or fixtures, applies timeouts and reports pass or fail. The hard part is ownership: the runner must kill a hung browser when a test times out, attribute artifacts to the right test, and keep its own process alive when the browser crashes mid-test.",
    k: ["Bundled runner vs adapter for an existing runner: bundling gives tight control of workers, timeouts and traces; adapters reuse team habits but split responsibility for hangs and reports.", "Tests as plain async functions vs a domain-specific syntax: plain functions are easy to debug and refactor; they also make forgotten awaits a silent source of races."],
    p: ["A test timeout that fires while the browser is blocked in a dialog leaves the process orphaned and the next test starts on a polluted machine.", "Hooks that launch a browser per file instead of per worker multiply startup cost and memory with no isolation benefit."],
    v: "Run a suite where one test deliberately hangs. Confirm it fails at the timeout with the right test name, its browser process is gone, and the following tests still pass.",
    dep: ["fixtures-and-lifecycle", "worker-pool", "browser-contexts"]
  },
  "fixtures-and-lifecycle": {
    s: "Declarative setup objects, such as a ready page or a logged-in context, that are created on demand for a test, shared at the right scope and torn down in reverse order.",
    d: "A fixture names a resource, says how to build it and how to dispose of it, and may depend on other fixtures. The runner resolves the dependency graph per test, caches fixtures that are scoped to a worker, and runs disposal even on failure. A typical chain is browser (per worker), context (per test), page (per test), then a logged-in page that depends on stored credentials. Difficulty comes from scope: a fixture that is too broad leaks state between tests, and one that is too narrow wastes seconds on every test.",
    k: ["Worker-scoped vs test-scoped fixtures: worker scope amortizes browser launch; test scope guarantees a clean slate at the cost of a context created per test.", "Lazy fixtures vs eager setup in hooks: lazy ones only pay for what a test uses; eager hooks are simpler to read but run for tests that do not need them."],
    p: ["Teardown that depends on the page still being open fails when a crash closed it, hiding the original error behind a cleanup error.", "A worker-scoped fixture that holds mutable state, such as a shared logged-in page, makes test order matter."],
    v: "Add logging to a fixture's setup and teardown, run three tests, and confirm worker-scoped fixtures run once per worker, test-scoped ones once per test, and teardown runs in reverse dependency order even for a failing test.",
    dep: ["browser-contexts", "storage-state", "per-test-isolation"]
  },
  "page-object-layer": {
    s: "A layer of classes or functions that wrap a page's locators and common actions in the vocabulary of the product, so tests say what they do and selectors live in one place.",
    d: "Each page or component gets an object exposing named locators and verbs such as addToCart or openSettings. Tests call those and assert on outcomes, never on selectors. When markup changes, one file changes. The layer should return locators, not resolved elements, so waiting stays lazy. It becomes hard when abstractions grow into a second framework: deep inheritance, objects that hide assertions, or verbs so coarse that a failure message no longer says which step broke.",
    k: ["Thin locator holders vs rich behavior objects: thin ones stay predictable; rich ones read well in tests but hide steps and make failures harder to localize.", "Assertions inside page objects vs in tests: inside, they remove duplication; outside, tests state their intent and the object stays reusable for scripts that do not assert."],
    p: ["Page objects that cache resolved elements go stale after a re-render and throw errors that look like timing bugs.", "A single giant object per application mirrors the whole site, so unrelated tests all change together."],
    v: "Rename a test id attribute in the application and confirm exactly one page object file needs a change for the whole suite to pass again.",
    dep: ["locator-chaining", "role-and-text-locators", "test-id-attributes"]
  },
  "retrying-assertions": {
    s: "Assertions on page state that poll until they hold or a timeout passes, so a test states the expected end state and the framework absorbs the delay in reaching it.",
    d: "A web-aware assertion takes a locator or page, re-evaluates the condition at intervals, and passes the first time it is true. On timeout it reports the last observed value, not just that it failed. Conditions cover text, visibility, counts, attributes, URL and title. It is the test-level counterpart of auto-waiting. The hard part is choosing what is retried: a retry on a value that has already been read into a variable never changes, so the assertion must receive the live handle.",
    k: ["Polling assertions vs read-then-compare: polling tolerates asynchronous rendering; read-then-compare is cheap but fails on the first stale read.", "Long default timeouts vs short ones: long ones hide slowness and make failures slow to appear; short ones expose real latency but flag slow CI machines as failures."],
    p: ["Asserting on a snapshot value such as an already-awaited text string defeats retries and recreates a race.", "A negated assertion that passes immediately because the element has not rendered yet proves nothing."],
    v: "Make the page update its text after a 2 second delay and assert the final text. The test must pass, and when the text never arrives, the failure must print the last observed text.",
    dep: ["auto-waiting", "locator-chaining", "timing-model"]
  },
  "per-test-isolation": {
    s: "The rule that each test starts from a clean browser state and cannot see another's cookies, storage or open pages, usually enforced by a fresh context per test.",
    d: "Isolation is built from a new browser context per test, which has its own cookies, local storage, cache and permissions, started in milliseconds because it shares the browser process. Server-side state is not covered: databases, queues and accounts need their own reset or unique data per test. The tradeoff is cost against certainty. Reusing a context across tests saves time and quietly lets one test's login, cart or feature flag leak into the next.",
    k: ["Context per test vs shared context: fresh contexts cost little and make tests order-independent; sharing saves login time but couples results.", "Resetting server data before each test vs unique data per test: resets are simple but serialize workers; unique data allows full parallelism and needs cleanup or tolerance for leftovers."],
    p: ["Isolating the browser but not the backend lets parallel tests edit the same account and fail intermittently.", "Persistent profile directories silently defeat isolation by carrying cookies between runs."],
    v: "Run test A that sets a cookie and local storage entry, then test B on the same worker, and confirm B sees neither. Then run the pair in reverse order and in parallel with the same result.",
    dep: ["browser-contexts", "storage-state", "shared-state-collisions"]
  },
  "reporters": {
    s: "Output formats for results: console lines, machine-readable files and browsable reports that tie each failure to its error, steps and attached screenshots or traces.",
    d: "Reporters subscribe to runner events such as test begin, step, failure and end, and render them. Console reporters aid developers; JUnit-style or JSON files feed CI dashboards; HTML reports link a failure to its trace, video and diff images. A good report shows the failing step, the locator involved and the last page state. It is harder than it looks because results arrive out of order from parallel workers and artifacts must be located and copied while the run is still in progress.",
    k: ["Streaming output vs summary at the end: streaming gives early feedback and survives crashes; summaries are tidier but lost when the run is killed.", "Self-contained HTML report vs links to an artifact store: self-contained is easy to share but large; links are light but expire with retention policies."],
    p: ["Reports that merge shards by test name collide when the same name appears in several projects or browsers.", "Attaching every artifact to every test, passed or not, fills disk and slows uploads."],
    v: "Fail one test in a sharded run and open the merged report: it must show that test once, with its error, step list, and a working link to its trace.",
    dep: ["artifact-collection", "trace-recording", "test-runner-hooks"]
  },
  "retries-and-quarantine": {
    s: "Policies that rerun failed tests and set known-unreliable ones aside, so intermittent failures do not block delivery while the underlying cause is investigated.",
    d: "A retry reruns a failed test in a fresh context, often with extra tracing enabled on the retry. A test that fails and then passes is reported as flaky, not as a success. Quarantine moves a repeatedly flaky test out of the blocking set into a separate run that still reports. The design question is accountability: retries without visibility turn every defect that reproduces one time in three into a green build, and quarantine without an owner and expiry date becomes a graveyard.",
    k: ["Retry once vs retry many times: one retry filters rare environmental noise; many retries mask real races and double suite time.", "Auto-quarantine by threshold vs manual curation: automation reacts fast but may hide a genuine regression; manual review is slower and accurate."],
    p: ["Counting a flaky pass as a pass erases the signal, and failure rate creeps up until retries stop saving the build.", "Retrying tests that mutate server state without cleanup makes the retry fail for a different reason."],
    v: "Inject a failure that occurs on the first attempt only. The report must mark the test flaky with both attempts' artifacts, and the flaky count must appear in the run summary.",
    dep: ["flake-triage", "reporters", "per-test-isolation"]
  },
  "crawl-scheduler": {
    s: "The queue and dispatcher that decide which URL a browser visits next, tracking depth, priority, retries and what has already been seen.",
    d: "Seeds enter a frontier. The scheduler normalizes URLs, drops duplicates, orders by priority or depth, hands each to a worker and requeues failures with backoff. A persistent frontier survives restarts. Concurrency is capped per host and overall. Real browsers cost seconds and hundreds of megabytes per page, so schedulers often use a plain HTTP fetch first and escalate to a browser only for pages that need script. The hard parts are URL normalization, loops through calendars or filters, and recovering exactly which work was in flight at a crash.",
    k: ["Browser for every page vs HTTP first with escalation: all-browser is uniform and simple; escalation cuts cost severalfold but needs a reliable test for when a page needs scripts.", "In-memory vs persistent frontier: memory is fast and simple; persistence survives crashes and allows many machines at the cost of a storage dependency."],
    p: ["Query-string variants of the same page are crawled as distinct URLs, producing thousands of duplicates.", "A crashed worker's claimed URLs are never released and silently drop out of the crawl."],
    v: "Seed a small site with a link cycle and a duplicate-by-parameter URL. The crawl must terminate, visit each canonical page once, and after a kill and restart resume without revisiting finished pages.",
    dep: ["worker-pool", "rate-limiting", "result-storage"]
  },
  "extraction-rules": {
    s: "The declarative or scripted rules that turn a rendered page into structured records, using locators, text patterns or structured data embedded in the page.",
    d: "Rules name fields and say how to find each: a locator and attribute, a regular expression on text, or a read of embedded JSON from a script tag or a network response. Sites often load data through an API call, and capturing that response is more stable than parsing the rendered tree. Output is validated against a schema, with missing fields reported as errors. Maintaining rules is the cost: sites change markup without notice, and a rule that silently returns empty values corrupts a dataset without any exception.",
    k: ["Parsing the rendered DOM vs reading the underlying API response: DOM matches what users see but breaks on redesigns; API data is cleaner but undocumented and may need signed parameters.", "Strict schemas that fail the record vs lenient extraction: strict surfaces drift immediately; lenient keeps data flowing with silent gaps."],
    p: ["A field selector that matches a similar element elsewhere on the page extracts the wrong value with no error.", "Extracting before late content has rendered yields empty fields that look like missing data on the site."],
    v: "Run the rules on a saved fixture page and a live page. Both must produce records that pass the schema, and a fixture with a renamed class must fail loudly with the missing field named.",
    dep: ["locator-chaining", "response-mocking", "script-evaluation", "role-and-text-locators"]
  },
  "pagination-and-scroll": {
    s: "Logic that moves through multi-page listings or infinite feeds, deciding when more content has loaded and when the end has been reached.",
    d: "Numbered or next-button pagination is followed by clicking until the control disappears. Infinite scroll needs scrolling the container, waiting for new items or a network response, and stopping when the count stops growing. Cursor-based APIs behind the feed can be called directly. The difficulty is knowing that nothing more will arrive: a slow response and an end of list look the same for a moment, so termination uses a combination of item counts, network idleness and a bounded number of empty attempts.",
    k: ["Driving the UI vs replaying the paging API calls: UI driving is faithful and slow; direct calls are fast but break when tokens or signatures change.", "Fixed scroll delay vs waiting on a network or DOM signal: fixed delays are trivial and either too slow or too short; signals adapt but need page-specific knowledge."],
    p: ["Stopping after one scroll that produced no new items misses content that loads after a slow response.", "Virtualized lists remove old rows from the DOM, so a final count of rendered items undercounts the total."],
    v: "Against a fixture feed of 500 items served with random delays, the crawler must collect exactly 500 unique items on ten repeated runs.",
    dep: ["scroll-into-view", "explicit-waits", "request-interception"]
  },
  "login-and-session-reuse": {
    s: "Authenticating once and saving the resulting cookies and storage so later runs and workers start already signed in, with detection for when the session has expired.",
    d: "A setup step drives the login form, possibly including a second factor, then exports the browser's storage state to a file. Later contexts load that file rather than logging in again. Some sites bind sessions to an address or fingerprint, and some sessions expire in minutes, so the code must detect a redirect to the login page and refresh. Credentials come from a secret store, never the repository. Reuse speeds suites dramatically but makes the saved file itself a sensitive artifact.",
    k: ["Login once per run vs per test: once is fast and shares an identity; per test is slow but isolates accounts and exercises the login path.", "Interactive login vs programmatic token acquisition: forms test the real path; direct token calls are faster and less brittle but skip what users do."],
    p: ["A cached storage state file committed or uploaded as a build artifact leaks live credentials.", "Parallel workers sharing one account invalidate each other when the site allows a single active session."],
    v: "Delete the saved state, run the suite, and confirm a single login occurs and all workers start authenticated. Expire the server session mid-run and confirm the code re-authenticates instead of failing every later test.",
    dep: ["storage-state", "browser-contexts", "security-and-secrets"]
  },
  "rate-limiting": {
    s: "Controls that cap request and page-visit rates per host, honor the site's stated crawl rules and back off when the server signals strain.",
    d: "A token bucket or per-host delay spaces requests. The scraper reads the site's published crawl rules and any crawl-delay hint, respects 429 and 503 responses by waiting for the indicated period, and adds jitter so many workers do not align. Browser pages generate dozens of sub-requests, so limiting visits is not the same as limiting requests; interception can block images, fonts and trackers to reduce load. It is hard to tune: too fast gets blocked or harms a small site, too slow makes the project unusable.",
    k: ["Per-host limits vs global limits: per-host protects each site and allows overall throughput; global is simpler but starves fast hosts or overloads slow ones.", "Fixed delays vs adaptive backoff: fixed is predictable; adaptive reacts to errors and latency but can oscillate and needs sensible bounds."],
    p: ["Counting only top-level navigations ignores the many sub-requests each page triggers, so the real load is far higher than planned.", "Retry loops that ignore the retry-after header turn a brief throttle into a ban."],
    v: "Point the crawler at a local server that logs arrival times. Per-host spacing must stay at or above the configured delay, and after the server returns 429 with a retry-after value, no request arrives before it elapses.",
    dep: ["request-interception", "ip-reputation", "site-terms-and-ethics"]
  },
  "result-storage": {
    s: "Where extracted records land: append-only files or a database, with keys that make writes idempotent so retries and reruns do not duplicate or lose rows.",
    d: "Records carry a stable key built from the source URL or an identifier in the page, plus a timestamp and the extractor version. Writes are upserts by key so a retried page replaces rather than duplicates. Raw captures, such as HTML snapshots or API responses, are stored separately so extraction can be rerun after a rule fix without refetching. Large crawls batch writes and checkpoint progress. The hard part is change detection: telling a genuine update on the site from a layout change that altered extracted values.",
    k: ["Storing raw pages as well as parsed records vs parsed only: raw storage costs space and enables reprocessing; parsed-only is smaller but every rule bug forces a recrawl.", "Upsert by natural key vs append every observation: upserts give a current view; appending preserves history and needs a query to find the latest."],
    p: ["A key that includes a tracking parameter makes each visit a new record.", "Partial pages from a failed load are saved as if complete and overwrite good earlier data."],
    v: "Run the same crawl twice and confirm the record count is unchanged, then corrupt one source page and confirm the stored record for it is not overwritten with empty fields.",
    dep: ["extraction-rules", "artifact-collection"]
  },
  "css-and-xpath": {
    s: "Structural selector languages that match elements by tag, attribute, class or position in the document tree, the oldest and most flexible way to find an element.",
    d: "A selector string is sent to the page, evaluated by the engine's query functions, and returns matching nodes. CSS selectors match tags, classes, attributes and relationships; XPath adds axis navigation, text conditions and upward traversal. They are fast and universal, and they couple the script to markup. Generated class names, reordered siblings and wrapper elements all break long positional paths. Both languages operate on the DOM, so by default they do not cross shadow boundaries or frame boundaries.",
    k: ["Short attribute selectors vs full structural paths: short ones survive layout edits; long paths are unambiguous today and break on the next wrapper element.", "CSS vs XPath: CSS is faster to read and write for most cases; XPath can climb to parents and match text, at the cost of verbosity."],
    p: ["Selectors that rely on auto-generated class names stop matching after each front-end build.", "An index-based selector such as the third list item silently targets a different element when the list order changes."],
    v: "Run the selector against the live page and count matches: exactly one for single-target selectors. Then reorder siblings in a fixture and confirm the selector still matches the intended element.",
    dep: ["strictness", "frame-tree", "script-evaluation"]
  },
  "role-and-text-locators": {
    s: "Locators that find elements the way a user or assistive technology would, by accessible role and name or visible text, rather than by markup structure.",
    d: "A role locator asks for a button, link or textbox with a given accessible name. The framework computes roles and names from the accessibility tree or equivalent logic, combining element semantics, labels and ARIA attributes. Text locators match visible content, with options for exact, substring and case. They survive restyling and encourage accessible markup, since a control with no name cannot be found. They break on copy changes and translations, so suites that run in several languages need locale-aware text.",
    k: ["Role and name vs test id: roles test what users perceive and reward accessible markup; test ids are immune to copy changes but verify nothing about accessibility.", "Exact vs substring text matching: exact avoids accidental matches; substring tolerates small copy edits and risks matching two elements."],
    p: ["Matching by text on a button that appears twice, in a menu and a dialog, resolves to two elements and raises a strictness error.", "Locators in one language fail in another locale because names are translated."],
    v: "Locate the submit control by role and name in the English and French builds of a page, and confirm it resolves to exactly one element with the same behavior, using translated names from the test data.",
    dep: ["accessibility-tree-queries", "strictness", "locale-and-timezone"]
  },
  "test-id-attributes": {
    s: "A dedicated attribute that developers add to elements solely so tests can find them, giving a stable handle independent of text, structure and styling.",
    d: "Markup carries an attribute such as data-testid with a human-chosen value. The framework offers a shortcut locator for it, and the attribute name is configurable. Build steps may strip them from production. They are stable under refactoring, and they require developer cooperation and discipline in naming. Overuse produces a suite that tests ids instead of behavior, and an id on a wrapper can still be attached while the control inside is not yet interactive.",
    k: ["Dedicated test ids vs semantic locators: ids are robust and explicit but add markup and tell nothing about accessibility; semantic locators need no markup changes.", "Ids kept in production vs stripped at build: keeping them lets tests run against production-like bundles; stripping hides internals but makes test builds differ from released ones."],
    p: ["Duplicate ids across components make a locator ambiguous once a list renders two copies.", "Ids copied from component names change when components are renamed, breaking tests without any behavior change."],
    v: "Search the built page for each id used by the suite and confirm each appears the expected number of times, and that renaming a CSS class and the visible text leaves the suite passing.",
    dep: ["strictness", "css-and-xpath"]
  },
  "locator-chaining": {
    s: "Composing locators by scoping one inside another and filtering by contained text or child elements, so a script can say which row's button instead of any button.",
    d: "A locator can be narrowed with a parent scope, a filter that requires text or a nested match, an index or first and last selection, and combined with and-or logic. Because locators are lazy descriptions, a chain is resolved only at action time, with the whole chain re-evaluated each time. That makes row-scoped actions on dynamic tables reliable. The cost is expressiveness versus readability: long chains are fragile reading, and positional filters reintroduce the ordering problems of structural selectors.",
    k: ["Scoping to a container then locating inside vs a single complex selector: scoping reads naturally and reports which level failed; one selector is compact and harder to debug.", "Positional picks (first, nth) vs content filters: positions are quick but wrong when data order changes; content filters tie the test to data it controls."],
    p: ["Filtering by text that appears in several rows selects the wrong row when test data is not unique.", "Chains re-evaluated on each action are slower on large tables and can match a different element between calls."],
    v: "On a table whose rows are shuffled on every load, click the action button for a named row 20 times and confirm the intended row's action fires every time.",
    dep: ["role-and-text-locators", "css-and-xpath", "strictness"]
  },
  "shadow-dom-piercing": {
    s: "Support for finding elements inside encapsulated shadow trees, which ordinary document queries cannot see into, including the case where trees are closed.",
    d: "Components may attach a shadow root so their internals are hidden from document-level queries. Frameworks either pierce open roots automatically in their selector engines or require explicit traversal steps. Closed roots expose no handle to page scripts, so the framework must use browser-level access through the protocol rather than page JavaScript. Piercing makes tests work against component libraries, and it also ties them to internal structure that the component author never promised.",
    k: ["Automatic piercing vs explicit entry: automatic piercing makes locators simple; explicit entry is clearer about boundaries and avoids matching hidden internals unintentionally.", "Targeting component internals vs the host element: internals allow detailed checks but break when the library updates; the host is stable and checks less."],
    p: ["A locator that works on open roots silently fails when the same component ships with closed roots.", "Slot content is rendered in the light tree but displayed inside the component, confusing scoping."],
    v: "Build a fixture with one open and one closed shadow component, each holding a button. Click both through the framework and confirm both click handlers fire.",
    dep: ["accessibility-tree-queries", "script-evaluation", "debugging-protocol"]
  },
  "strictness": {
    s: "The rule that a locator used for a single-element action must match exactly one element, failing with a list of the matches rather than picking one silently.",
    d: "When a locator resolves to zero elements it waits, since the element may appear. When it resolves to more than one and the action needs one, a strict framework throws an error naming the count and describing each candidate. Non-strict modes pick the first. Strictness moves ambiguity from a mysterious wrong click to an immediate error. It makes locators more precise at the price of occasional annoyance, and it interacts with waiting: a locator briefly matching two elements during a transition may fail where a retry would succeed.",
    k: ["Strict resolution vs first match: strict errors expose ambiguity early; first-match is lenient and hides wrong-element bugs.", "Failing at once on multiple matches vs retrying until one remains: failing is simple; retrying copes with transitional duplicates and hides slow render churn."],
    p: ["Silencing strict errors by adding first everywhere trades noisy failures for tests that click the wrong item.", "Duplicate elements in hidden responsive layouts, such as a mobile and desktop menu, cause strict errors at only some viewport sizes."],
    v: "Add a second matching element to a fixture and confirm the action fails immediately with a message naming both candidates, rather than clicking one.",
    dep: ["css-and-xpath", "auto-waiting"]
  },
  "accessibility-tree-queries": {
    s: "Queries against the browser's accessibility tree, the structured view of roles, names and states that assistive technology uses, offering a semantic way to find and inspect elements.",
    d: "The browser computes an accessibility tree alongside the layout tree: each node has a role, a computed name, states such as checked or disabled, and relations. Frameworks fetch it through the protocol or compute names themselves, then use it to resolve role locators and to snapshot a page as a text outline. Snapshots are compact and meaningful to people and to AI agents. Difficulty comes from differences between engines in name computation and from the tree changing as dynamic content arrives.",
    k: ["Browser-computed tree vs framework re-implementation: using the browser is accurate for that engine; re-implementing is portable and subtly diverges from real assistive technology.", "Tree snapshots as assertions vs targeted locators: snapshots catch broad regressions and are noisy; targeted checks are quiet and narrow."],
    p: ["Hidden elements still appear in the tree under some rules, so a locator matches something not visible.", "Snapshot assertions become noise when unrelated copy changes alter the outline."],
    v: "Dump the accessibility outline of a form page and confirm every input has a non-empty name. Remove a label in a fixture and confirm the check flags that input.",
    dep: ["debugging-protocol", "domains-and-events"]
  }
});
