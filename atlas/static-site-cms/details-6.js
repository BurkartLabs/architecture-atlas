// Details for the static site generator & CMS plate, part 6: dynamic features, foundation, cross-cutting.
ATLAS.details("static-site-cms", {
  "partial-hydration-and-islands": {
    s: "Shipping interactive code only for the parts of a page that need it, leaving the rest as plain HTML, so most of the page costs no script at all.",
    d: "Components marked interactive are rendered to HTML at build time and wrapped in a marker with their properties. A small loader finds markers in the browser and downloads and starts each component's code when a condition is met: at load, when visible, when idle, or on interaction. Each island is independent and does not share a tree with the rest of the page. It is hard because islands cannot easily share state, properties must be serializable, and the server and browser output must match.",
    k: ["Islands hydrated on demand vs hydrating the full page: islands send little script and make cross-island state awkward, while full hydration is simple and sends everything.", "Hydrate on visibility vs on load: visibility defers cost for off-screen parts, while loading immediately avoids a delay on first interaction."],
    p: ["Server-rendered and browser-rendered output differ, and the island flashes or throws a mismatch error on start.", "Properties passed to an island include a non-serializable value, so the island starts with missing data."],
    v: "Load a page with three islands and confirm only their scripts download, each starts at its configured moment, and a static section has no script attached; disable scripts and confirm content remains readable.",
    dep: ["components", "asset-bundling", "render-stage"]
  },
  "client-side-search": {
    s: "A search box that runs entirely in the browser against a downloaded index, giving instant results with no search server.",
    d: "On first focus or load, a small script downloads the index files made at build time and a ranking routine. Queries are tokenized, matched against the index, scored with field weights and shown with highlighted excerpts. Chunked indexes load only needed pieces. It is hard because index size is paid by every searching visitor, typo tolerance and stemming add code, and results can only be as fresh as the last build.",
    k: ["Client-side index vs a hosted search service: client-side needs no server and is limited by index size, while a service scales and adds cost, an account and a dependency.", "Loading the index on page load vs on first use: on load makes first search instant and costs everyone bandwidth, while on first use saves it for those who search."],
    p: ["A five-megabyte index downloads on the first keystroke on a mobile connection and the box appears frozen.", "Search offers results for pages removed since the index was last cached by the browser."],
    v: "Throttle the network, focus the search box and type a query; confirm results appear within the target time, the index size matches the budget, and an unpublished page does not appear after a rebuild.",
    dep: ["search-index-build", "partial-hydration-and-islands"]
  },
  "form-handling": {
    s: "Accepting form submissions such as contact and sign-up on a site with no server of its own, by posting to a service or function that stores or forwards them.",
    d: "The page contains a standard form whose action points to a form service or a serverless function. The receiver validates input, checks spam signals, stores the submission, sends notifications and may call other services. The browser either navigates to a confirmation page or an enhancement sends the data without reload. It is hard because spam arrives immediately, submissions contain personal data needing storage and deletion rules, and the page itself must work without scripts.",
    k: ["Third-party form service vs own function: a service is quick to set up and holds your data elsewhere, while your own function gives control and a thing to run and secure.", "Plain form post vs script-enhanced submit: plain posts work everywhere and leave the page, while enhanced submits feel smooth and fail when scripts do not load."],
    p: ["A form with no spam protection receives thousands of junk submissions in its first week.", "Submissions sit in a service dashboard that nobody checks, and customers wait for replies that never come."],
    v: "Submit the form with valid input, with missing fields and with a spam trigger; confirm the valid one is stored and notified within a minute, the second shows field errors, and the third is rejected; repeat with scripts disabled.",
    dep: ["serverless-functions", "secrets-and-config"]
  },
  "serverless-functions": {
    s: "Small pieces of server code, run on demand by the host or edge, that provide the dynamic parts of an otherwise static site.",
    d: "A function is a file in a known folder, deployed with the site and mapped to a path. It receives the request and returns a response, runs in a short-lived environment with limits on time and memory, and reads secrets from configuration. Typical uses are form receivers, webhooks, authenticated proxying and personalization. It is hard because cold starts add latency, functions have no persistent local state, and each one is a public endpoint needing validation, limits and monitoring.",
    k: ["Functions at the edge vs in one region: the edge is close to visitors and limited in capabilities, while a region has full capabilities and added distance.", "Functions deployed with the site vs a separate service: with the site they version together and roll back together, while a separate service can change on its own schedule."],
    p: ["A function without rate limits is called by a script in a loop and produces a large bill.", "A function reads a secret with write access to the content store and a bug exposes it in an error response."],
    v: "Call each function with valid, malformed and oversized input, and confirm correct responses, status codes and error bodies without internal details; call it repeatedly past the limit and confirm throttling.",
    dep: ["static-hosting", "secrets-and-config", "api-authentication"]
  },
  "hybrid-rendering": {
    s: "Rendering selected pages when requested instead of at build time, then caching the result, for content too large or too dynamic to prebuild.",
    d: "Routes are marked as on-demand or incremental. A request for a page not yet built runs the renderer in a function, stores the output in the cache, and serves it; later requests hit the cache until it expires or is revalidated by a tag or webhook. The rest of the site remains static. It is hard because it reintroduces a server to operate, first requests are slow, and cache state differs per location so visitors can see different versions.",
    k: ["Prebuild everything vs render on demand: prebuilding is predictable and slow for huge sites, while on-demand shortens builds and makes first requests slow.", "Time-based expiry vs event-based revalidation: time-based expiry is simple and shows stale content for a while, while events are fresh and require reliable delivery."],
    p: ["A crawler requests every product page at once and the render functions are overloaded.", "Locations revalidate at different times and one visitor sees a price another no longer does."],
    v: "Request an unbuilt page and confirm it renders, then request it again and confirm a cache hit; publish a change and confirm the page is served updated after revalidation in more than one location.",
    dep: ["serverless-functions", "render-stage", "cdn-cache-invalidation"]
  },
  "gated-content": {
    s: "Showing some pages or parts only to signed-in or paying visitors on a site whose files are otherwise public.",
    d: "Protection happens at the edge or in a function, which checks a session or token before returning the file, or in the browser, which fetches protected parts through an authenticated call after load. Protected files are kept out of the public output or served only through the checking layer. It is hard because anything in the public folder is public, client-only gating hides content from view and not from download, and search indexes and feeds must not include gated text.",
    k: ["Check at the edge vs fetch protected data after load: edge checks protect whole files and need support from the host, while fetching after load protects only the fetched data and suits partial gating.", "Teaser in the public page vs hiding entirely: teasers promote the content and can leak too much, while hiding prevents leaks and loses discovery."],
    p: ["Gated articles are included in the public search index and feed, so their text can be read by anyone.", "Gated files are written to the public output folder and are reachable by direct address."],
    v: "Request a gated page without a session, with an expired one and with a valid one; confirm refusal, refusal and success; then search the public output for gated text and confirm it appears nowhere.",
    dep: ["serverless-functions", "identity-and-sso", "search-index-build"]
  },
  "version-control-store": {
    s: "A repository that records every change to code, templates, configuration and, in file-based setups, content, with history, branches and merging.",
    d: "Changes are saved as commits with authors and messages, organized in branches, and combined by merging after review. Hosting adds access control, protected branches and hooks that start builds. For content, history serves as revisions and branches as workflows. It is hard because binary files bloat it, concurrent edits to the same file conflict, and non-technical editors need an interface that hides the machinery without losing its guarantees.",
    k: ["Content and code in one repository vs separate: one keeps them versioned together and mixes release rhythms, while separate repositories let content change without code review.", "Trunk with short branches vs long-lived branches: short branches limit conflicts, while long-lived branches suit big redesigns and drift from the main line."],
    p: ["Large generated files and images committed to the repository make every clone slow.", "A secret committed once remains in history after it is removed from the latest version."],
    v: "Clone the repository on a clean machine, build, and confirm the output matches the deployed site for the same commit; confirm protected branches reject a direct push.",
    dep: ["identity-and-sso"]
  },
  "object-storage": {
    s: "Durable, flat storage for large files addressed by key, holding original media, build artifacts, caches and backups.",
    d: "Objects are written whole with a key, metadata and an access policy, replicated across devices and locations, and read by key or by listing a prefix. Lifecycle rules move or delete old objects, versioning keeps earlier copies, and signed addresses give temporary access. It is hard because there is no rename or append, listing is eventually slower on huge prefixes, and permissions are set per bucket or object and are commonly misconfigured as public.",
    k: ["Versioned buckets vs overwriting: versioning allows recovery from mistakes and costs storage, while overwriting is cheaper and permanent.", "Public read for assets vs signed access: public read is simple and fast with delivery networks, while signed access keeps private assets private and needs address generation."],
    p: ["A bucket meant for build caches is public, and internal drafts are downloadable by anyone with the address.", "A lifecycle rule intended for temporary files also matches originals and deletes them."],
    v: "Write, overwrite and delete an object in a versioned bucket and confirm earlier versions are recoverable; request a private object without a signature and confirm a refusal.",
    dep: []
  },
  "identity-and-sso": {
    s: "The service that knows who users are, authenticates them with passwords, second factors or a company login, and supplies their roles to the CMS and its tools.",
    d: "Users sign in once and receive a session or token that the editing interface and API accept. Groups from the identity source map to roles. Invitations, disabling departed users and second factors are managed centrally. Machine accounts get separate tokens. It is hard because removal must take effect everywhere quickly, roles in the identity source and in the CMS can disagree, and outside contributors need access without full accounts.",
    k: ["Company single sign-on vs accounts local to the CMS: single sign-on centralizes offboarding and policy, while local accounts work for outside contributors and need separate management.", "Roles from the identity groups vs assigned inside the CMS: group-based roles stay in step with the organization, while in-CMS roles are finer and drift."],
    p: ["A departed editor keeps access for weeks because a local account was never disabled.", "A role mapping change in the identity service silently gives a group publish rights."],
    v: "Disable a user in the identity service and confirm their next request to the API is refused within the stated time; add a user to a group and confirm they receive exactly the mapped role.",
    dep: []
  },
  "build-runners": {
    s: "The machines or containers that execute builds in a clean, repeatable environment with pinned tools, cached dependencies and limited credentials.",
    d: "A runner checks out the source, restores caches, installs pinned tool versions, receives only the secrets the job needs, runs the build, uploads the artifact and logs, and is discarded. Sizes are chosen to fit memory and processor needs, and concurrency is limited by plan or budget. It is hard because builds must give the same output on any runner, large image-heavy builds need much memory, and secrets in the environment can be exposed through logs or plugins.",
    k: ["Fresh environment per build vs reused workers: fresh environments are clean and slow to start, while reused workers are fast and carry state between builds.", "Hosted runners vs self-managed: hosted runners need no upkeep and limit size and concurrency, while self-managed give control and need patching."],
    p: ["A tool version not pinned changes between builds and the same source produces different output.", "A build running out of memory is killed with no message and appears as a vanished job."],
    v: "Run the same commit on two runners and compare output hashes; confirm identical results, confirm the job log shows tool versions, and confirm no secret value appears in the log.",
    dep: ["secrets-and-config"]
  },
  "job-queue": {
    s: "A durable queue that holds background work such as builds, webhook deliveries, image processing and scheduled tasks, with retries and ordering.",
    d: "Producers add jobs with a type, payload and optional delay. Workers take jobs, process them, and acknowledge; failures are retried with backoff and eventually moved to a dead-letter list for inspection. Priorities and concurrency limits shape throughput. It is hard because delivery is at least once so jobs must be safe to repeat, ordering is weak, and long jobs need heartbeats to avoid being handed out twice.",
    k: ["At-least-once delivery with idempotent jobs vs exactly-once attempts: idempotent jobs are robust and require care in design, while exactly-once guarantees are expensive and rarely true.", "One shared queue vs per-type queues: a shared queue is simple, while per-type queues stop slow jobs from blocking urgent ones."],
    p: ["A failing job retries forever and floods the workers with the same error.", "A job that is not safe to repeat runs twice after a timeout and sends duplicate notices."],
    v: "Enqueue a job that fails twice and then succeeds, confirm two retries with growing delay and one completion, and confirm a job that always fails ends in the dead-letter list with its error.",
    dep: ["object-storage"]
  },
  "secrets-and-config": {
    s: "Secure storage and delivery of credentials and environment-specific settings, such as API tokens, deploy keys and per-environment addresses, to builds and functions.",
    d: "Secrets live in a managed store, are granted to named jobs or functions, and are injected as environment values at run time. Plain configuration differs by environment: production, staging and preview. Rotation replaces values without changing code, and access is logged. It is hard because secrets leak through logs, error pages, bundles and pull requests from forks, and because configuration differences between environments cause failures that appear only after release.",
    k: ["Secrets injected at runtime vs stored in the repository encrypted: runtime injection keeps them out of history, while encrypted files version with code and need key management.", "Separate values per environment vs shared: separate values prevent staging from touching production, and shared ones reduce setup and cause accidents."],
    p: ["A token is printed by a build command run with verbose logging and remains in public logs.", "A build from an outside contribution is given production secrets because the pipeline does not distinguish forks."],
    v: "Rotate a token, run a build, and confirm it works with the new value and fails with the old; search the build log and the output folder for the token and confirm it appears nowhere.",
    dep: ["identity-and-sso"]
  },
  "build-time-vs-request-time": {
    s: "The decision, made per feature, about whether a result is computed once during the build or each time a visitor asks, which sets cost, freshness and complexity.",
    d: "Build-time work is paid once and served from files: pages, feeds, indexes and optimized images. Request-time work runs per visitor in a function or the browser: personalization, forms, search over live data. Moving a feature across the line changes failure modes, security exposure, cost model and how stale the answer can be. It is hard because the boundary drifts: each dynamic need pushes toward runtime code until the site is a server application with static files in front.",
    k: ["Build everything vs compute some on request: building is fast, cheap and stale, while request-time gives freshness and brings servers, scaling and security to operate.", "Browser-side computation vs edge functions: the browser needs no server and exposes data and logic to the visitor, while edge functions keep logic private and add latency and cost."],
    p: ["A feature that needed live data is built statically and shows yesterday's stock levels for weeks.", "Each added function slowly makes the site depend on infrastructure that the static design was meant to avoid."],
    v: "List every page and feature with where each value is computed, then change a source and measure how long until visitors see it; the measured delay should match the documented freshness for each feature.",
    dep: ["incremental-builds", "serverless-functions", "hybrid-rendering"]
  },
  "content-model-as-contract": {
    s: "Treating the schema as an agreement between editors, templates, APIs and search, so changes to it are versioned, migrated and reviewed like any other interface.",
    d: "Editors fill fields, templates read them, feeds and search extract them, and other systems consume them through the API. Each assumes the shape stays the same. Renaming a field or changing a block's structure breaks every consumer at once, often silently. The contract is kept by versioned schemas, migrations, validation at build and tests that render sample content. It is hard because the editors who know which fields matter are not the people changing the schema.",
    k: ["Additive-only changes vs free restructuring: additive changes never break consumers and leave clutter, while restructuring keeps the model clean and requires migrations and coordination.", "Strict schema with early failures vs lenient with defaults: strict failures surface every mismatch immediately, while defaults keep the site building and hide drift."],
    p: ["A field rename in one team's branch silently blanks a section on every page until a visitor reports it.", "A template depends on an optional field that editors never fill in."],
    v: "Change a schema in a branch, run the build and the migration on a copy of production content, and confirm validation lists every affected entry and every template reading a removed or renamed field.",
    dep: ["content-types-and-schemas", "schema-migrations", "content-validation"]
  },
  "url-and-identity-stability": {
    s: "Keeping each page's address, and each entry's identifier, constant over time, so links, bookmarks, feeds, references and search rankings keep working.",
    d: "Identifiers are assigned once and never reused. Addresses derive from them or are frozen at first publication, and any unavoidable change produces a redirect. Internal links go through identifiers and are resolved at build. Feeds and structured data use the same identifiers. It is hard because titles, sections and sites are reorganized, migrations and redesigns tempt wholesale changes, and every address ever published remains a promise to the outside world.",
    k: ["Frozen slugs vs slugs following the title: frozen slugs protect links and drift from content, while following titles looks tidy and requires reliable redirects.", "Meaningful URLs vs opaque identifiers: meaningful URLs help people and search and invite reorganization, while opaque identifiers never change and say nothing."],
    p: ["A redesign changes the URL structure with no redirect plan and search traffic drops by half.", "Identifiers reused after deletion send old links to unrelated pages."],
    v: "Crawl the live site and compare every URL from the previous release's sitemap with the new one; each old URL must return success or a single redirect to a current page.",
    dep: ["permalinks", "redirects", "relations-and-references"]
  },
  "cache-and-invalidation": {
    s: "The set of caches between a content edit and a visitor, and the rules that make each one expire or refresh at the right moment.",
    d: "Caches exist at every stage: the content API's responses, the build cache, processed images, the host, the delivery network and the browser. Each has its own key and lifetime. Correctness depends on every cache being keyed on all inputs and invalidated when any of them changes. Fingerprinted assets avoid invalidation by changing name; pages need purges or short lifetimes. It is hard because stale output looks valid and a missed layer shows only to some visitors.",
    k: ["Short lifetimes vs explicit invalidation: short lifetimes are simple and forgiving, while explicit invalidation gives fresh content with long caching and depends on a complete list.", "Names that change with content vs fixed names with purges: changing names make caches safe by construction, while fixed names are needed for pages and must be purged."],
    p: ["A cache key that omits a build setting serves output from the wrong environment.", "Each layer's lifetime is set separately and the sum is hours longer than anyone expected."],
    v: "Publish an edit and trace it through each layer with timestamps and cache-status headers, confirming each layer's refresh time is within its documented limit and the visitor sees the change by the total allowed time.",
    dep: ["build-cache", "cdn-cache-invalidation", "fingerprinting", "response-headers"]
  },
  "trust-and-access": {
    s: "Who and what is allowed to read, change and publish content, and which inputs are trusted: editors, plugins, external data, uploaded files and visitors.",
    d: "Editors can change what everyone sees, so their access is checked on the API. Plugins and build scripts run with build credentials. External data and uploads are untrusted and must be validated and escaped. Tokens carry the least power that works. Public output is public: anything placed in the build folder can be fetched. It is hard because the build joins privileged access and untrusted input, so one injected field can become script on every page.",
    k: ["Least-privilege tokens per integration vs one shared token: separate tokens limit damage and add inventory to maintain, while a shared token is simple and untraceable.", "Sanitizing content on input vs escaping on output: sanitizing on input protects every consumer once, while output escaping is always correct and must be done in every template."],
    p: ["A build secret is exposed to a plugin, which sends it to a remote server.", "Content from an external source is rendered without escaping and a field injects script into every page."],
    v: "Attempt each privileged action with the lowest role and a revoked token, then store script markup in every text field and rebuild; confirm refusals for the first and escaped output for the second.",
    dep: ["roles-and-permissions", "api-authentication", "secrets-and-config", "templating-engine"]
  },
  "localization-scope": {
    s: "The decision about which languages and regions the site serves, which content is translated or shared, and how untranslated content behaves.",
    d: "Languages affect the schema, which fields are localized, the editing workflow, URLs, templates, search, sitemaps and feeds. Each added locale multiplies pages, translation cost and checking. Decisions include fallback rules, regional variants, right-to-left layout, date and number formats, and whether each locale publishes on its own. It is hard because localization is cheap to defer and expensive to add later, when URLs, identifiers and field structure are already fixed.",
    k: ["Locales as variants of one entry vs independent entries: variants keep structure and translations linked, while independent entries let regions diverge and lose the connection.", "Full translation before launch vs launching partial locales: full translation gives clean sites at a cost and delay, while partial launch brings value sooner and mixes languages."],
    p: ["Right-to-left languages are added after launch and the layout and icons are mirrored incorrectly.", "Locale added with no plan for updates, and translations fall behind the source."],
    v: "Build with the default and one added locale, then check each page's alternates, dates and numbers, the layout direction, and the search and sitemap entries, confirming every page and index is correct in the second locale.",
    dep: ["localized-fields", "locale-routing", "translation-workflow"]
  },
});
