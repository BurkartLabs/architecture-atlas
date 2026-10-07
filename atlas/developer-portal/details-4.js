// Details for the developer portal plate, part 4: identity and permissions, runtime platform, cross-cutting concerns.
ATLAS.details("developer-portal", {
  "authentication": {
    s: "Verifies who is using the portal by delegating sign-in to the organization's identity provider through standard protocols, and issues a session or token the rest of the portal trusts.",
    d: "The portal redirects unauthenticated users to the identity provider, receives a signed assertion or token after sign-in and validates its signature, issuer, audience and expiry. It then creates a session, often in a cookie, and refreshes it. Several providers may be supported for different populations. The hard parts are session lifetime and logout: long sessions are convenient and extend exposure, and logout in the portal does not end the provider session or invalidate tokens already issued to plugins.",
    k: ["Single identity provider vs several: one provider keeps identities consistent, but contractors and partners often sit in a different system and need a second path.", "Cookie sessions vs bearer tokens in the browser: cookies are simpler to protect against script access, while tokens are easier to send to other services and easier to steal."],
    p: ["A token's audience is not checked and a token issued for another application is accepted.", "Sessions last thirty days, so a departed engineer stays signed in after the account is disabled."],
    v: "Disable a test user in the identity provider and confirm that their next request after the session refresh interval is rejected, and that a token with the wrong audience is refused.",
    dep: ["config-system","integration-credentials"]
  },
  "sign-in-resolution": {
    s: "Maps the identity asserted by the provider to a catalog user entity and its group memberships, which then determine ownership views and permissions for the session.",
    d: "After authentication, a resolver takes claims such as email or username and looks up the matching user entity in the catalog, reading its group memberships through relations. The result is an identity with an entity reference and ownership references that is embedded in the session. A failure to find a user can reject sign-in or create a guest. The difficulty is matching: emails change, aliases differ, and a mistaken match makes a person inherit another's permissions.",
    k: ["Requiring a catalog user entity vs allowing sign-in without one: requiring ensures every action is attributable and permissioned, but locks out people before the directory sync catches up.", "Matching by immutable id vs by email: ids are stable and not always supplied by providers; email is available and breaks when people change names."],
    p: ["A new hire cannot sign in until the next sync because their user entity does not exist yet.", "Two users share an email alias and one is resolved as the other."],
    v: "Sign in as a user whose email changed last week and confirm the session resolves to their existing entity with the right team memberships, not a new empty one.",
    dep: ["authentication","identity-group-sync","entity-references"]
  },
  "permission-framework": {
    s: "The common mechanism that every plugin uses to ask whether the current identity may perform a named action, such as reading an entity, creating a location or running a template.",
    d: "A plugin declares permissions, named with the resource type and action. At run time, it sends an authorization request with the user's identity and optionally a resource reference. The framework forwards it to a policy, which returns allow, deny or a conditional result that can be applied as a filter. Both back end and front end consult it. The hard part is performance and coverage: filtering large lists needs conditions instead of one call per item, and any endpoint that forgets the call is open.",
    k: ["Central decisions through a policy vs each plugin deciding for itself: central policy gives one place to audit and change rules, but makes every request depend on it and its latency.", "Conditional decisions that become query filters vs per-item checks: filters scale on big lists, and require resources to expose the fields that conditions refer to."],
    p: ["A new endpoint omits the authorization call and exposes data even though the page hides it.", "Per-item checks on a list of ten thousand entities take seconds and time out."],
    v: "For each back end route of a plugin, call it as a user without permission and confirm every one returns a denial, and list a thousand entities as a restricted user and confirm response time stays within budget.",
    dep: ["sign-in-resolution","policy-rules"]
  },
  "policy-rules": {
    s: "The rules that turn identity, action and resource into a decision, written as code or configuration: who may create, edit, delete, register and run each thing.",
    d: "A policy implements a function from request to decision. Typical rules grant everything to administrators, allow owners to edit their entities, restrict deletion and let all signed-in users read. Rules may use group membership, ownership relations and entity labels. Policies are versioned and tested. The difficulty is expressing intent clearly: the permission model grows by exceptions, and a policy nobody can read becomes either too permissive for safety or too restrictive for work to proceed.",
    k: ["Ownership-based rules vs explicit access lists: ownership rules follow the catalog and need no extra maintenance, but depend on correct ownership data; lists are precise and drift.", "Default allow for reads vs default deny: allow keeps the catalog open and discoverable, which is its purpose; deny protects sensitive entities and makes the portal feel closed."],
    p: ["Ownership data is wrong for a service, so its real owners cannot edit it and strangers can.", "A policy change is deployed without tests and removes read access for a whole department."],
    v: "Run the policy test suite with a table of identities, actions and resources and confirm each decision matches the expected one, including a non-owner editing, an owner editing and an administrator deleting.",
    dep: ["owner-model","entity-level-visibility"]
  },
  "entity-level-visibility": {
    s: "Controls which entities and fields a person can see, hiding sensitive services, restricted documentation or fields such as security contacts from those without access.",
    d: "Visibility can be a property of the entity, such as an internal-only label, or a computed rule over ownership and group. Back end APIs apply it as a filter on lists and as a check on single reads. Search and graph views must apply the same rule or leak. Partial visibility, where a restricted entity appears in a relation as an anonymous node, is a common design. It is hard because every new surface, from export to notification text, is another way to leak.",
    k: ["Hiding restricted entities entirely vs showing a placeholder: hiding is safest, while placeholders keep graphs and dependency analysis complete without revealing details.", "Whole-entity visibility vs field-level: entity-level is simple to reason about, while field-level hides one sensitive value and multiplies the number of checks and cases."],
    p: ["A notification includes the title of a restricted entity to everyone on a distribution list.", "A dependency graph shows names of restricted entities because it reads the database directly."],
    v: "Mark one entity restricted, then as an outsider request its page, API record, search results, graph, a related entity's relations and an export, and confirm none reveals the name or contents.",
    dep: ["permission-framework","annotations-and-labels","catalog-api"]
  },
  "service-auth": {
    s: "Authenticates programs calling the portal and the portal calling other services: tokens for plugins, automation, pipelines and external systems, with scopes and expiry.",
    d: "Machine callers use tokens or signed credentials minted by an administrative process or exchanged from a workload identity. Plugin-to-plugin calls carry a short-lived token naming the caller and the user on whose behalf it acts. Tokens have scopes, such as read-only catalog access, and rotate on a schedule. The hard problem is sprawl: long-lived static tokens end up in scripts and chat messages, and a token valid for everything is a skeleton key.",
    k: ["Short-lived exchanged tokens vs long-lived static tokens: short-lived tokens limit leak damage, but need identity infrastructure at the caller; static tokens work anywhere and are the main leak.", "Acting as the user vs acting as the service: acting as the user keeps permissions and audit accurate, while acting as the service avoids user tokens at the cost of letting actions exceed what the user may do."],
    p: ["A token created for a pipeline never expires and sits in a repository for years.", "A plugin forwards the user's credential to a third system that should not receive it."],
    v: "List all active service tokens with owner, scope and expiry, and confirm none lacks an expiry or an owner, and that a read-only token is refused when it attempts to register a location.",
    dep: ["authentication","config-system"]
  },
  "integration-credentials": {
    s: "How the portal stores and uses credentials for external tools: keys, application installations or tokens, with the least access needed and a path for rotation.",
    d: "Integrations to hosts, CI, cloud and paging systems each need credentials. They are loaded from a secrets store or configuration at start-up, are scoped per integration and are injected into plugin code through a service so that plugins never read raw files. Where possible, the portal uses an installed application with narrow permissions instead of a personal token. The hard part is blast radius: a read-all token to the version control host is the most valuable secret in the portal, and rotation without downtime needs support in every consumer.",
    k: ["Application installations with scoped permissions vs personal tokens: application credentials are narrower, auditable and survive staff changes, but need setup per organization; personal tokens are easy and tied to one person.", "One shared credential per system vs per-plugin credentials: per-plugin credentials limit damage and complicate setup; a shared one is simple and widens every compromise."],
    p: ["A personal token of an engineer who has left runs every integration and breaks on the day the account is disabled.", "Credentials sit in a plain configuration file in the repository."],
    v: "Rotate one integration's credential in the secrets store and confirm the portal picks up the new value without a restart, with no failed calls in the following hour and the old credential revoked.",
    dep: ["config-system"]
  },
  "audit-log": {
    s: "A tamper-resistant record of who did what in the portal: registrations, edits, deletions, permission changes, template runs and exemption approvals.",
    d: "Components emit audit events with actor, action, target, time and result, which are written to an append-only store and shipped to central log systems. Events cover both humans and automation. Access is restricted and retention follows policy. The log is used for investigation and compliance. The hard part is completeness and noise: events must be emitted by every plugin that makes changes, not just the core, and logging every read creates a stream nobody can search.",
    k: ["Logging writes only vs logging reads of sensitive data too: writes are manageable and cover changes, while reads of restricted entities show data exposure and multiply volume.", "Application-level audit events vs relying on source system logs: application events record intent and the user, while source logs are authoritative for the system but show only the portal's service account."],
    p: ["A plugin changes data without emitting an event, leaving a gap exactly where a question arises.", "Audit entries record the service account rather than the user, so nobody can tell who acted."],
    v: "Perform one of each audited action as a named user and confirm the log has an entry with that user, target and result for every action, and that editing a stored entry is rejected.",
    dep: ["sign-in-resolution","event-bus","catalog-database"]
  },
  "catalog-database": {
    s: "The relational store behind the catalog: entities, relations, locations, provenance, search state and task data, with the schema and indexes that keep reads fast at tens of thousands of entities.",
    d: "Raw ingestion results, stitched entities, relations, errors and refresh state live in tables, often with a JSON column for the entity body and indexes on common filters. Multiple portal instances share it. Writes are bursty during ingestion and reads are interactive, so the two compete. The hard parts are scale and contention: relation queries over large graphs, large JSON columns, and stitching writes that lock hot rows can make pages slow just when ingestion is busiest.",
    k: ["Entity body as JSON with extracted index columns vs a fully normalized schema: JSON is flexible for new kinds and fields, but queries on it need extra indexes; normalized tables are fast and rigid.", "One database for all plugins vs separate per plugin: one is easy to run and back up, while separate databases isolate load and cost more to operate."],
    p: ["A bulk ingestion saturates the database and every user-facing page slows.", "A missing index on a common filter turns a list page into a full scan once the catalog reaches fifty thousand entities."],
    v: "Load the database with ten times the production entity count, run the ten most common queries and confirm each stays within its latency budget, and watch ingestion running alongside without exceeding the budget.",
    dep: ["schema-migrations"]
  },
  "catalog-api": {
    s: "The programmatic interface to the catalog: query, filter, fetch by reference and walk relations, used by the front end, plugins, scripts and external systems.",
    d: "Endpoints return entities by reference, list them with filters, sorting and paging, return facets and ancestry, and submit validation requests. Responses are shaped for the common reads and reflect visibility rules. It is also the contract that automation depends on. The hard problems are paging and filtering over large sets: offset paging is slow and unstable under change, filter languages grow, and fields that are requested by every plugin make responses large.",
    k: ["Cursor paging vs offset paging: cursors are stable and fast on large sets, but cannot jump to a page; offsets are simple and misbehave under writes and large offsets.", "A general filter language vs a few fixed queries: a language lets tools build what they need, but exposes expensive queries; fixed queries are predictable and need code for each use."],
    p: ["A plugin requests all entities with all fields on every page view and slows the database.", "The API changes a field shape and silently breaks scripts that parse it."],
    v: "Page through the entire catalog with a cursor while entities are created and deleted, and confirm no entity is skipped or repeated, then call each endpoint as a restricted user and confirm filtering of hidden entities.",
    dep: ["catalog-database","entity-level-visibility","cache-layer"]
  },
  "config-system": {
    s: "Layered configuration for the portal: files, environment variables and secrets, merged by precedence, validated and exposed to plugins with a clear boundary between server-only and browser-visible values.",
    d: "Configuration is loaded from base files, environment-specific overrides and environment variables, merged and validated against schemas contributed by core and plugins. Secrets are substituted from environment or a secrets store. A designated subset is sent to the browser. Changes take effect on restart in most designs. The hard parts are precedence surprises and leakage: which layer wins is rarely obvious to the person debugging, and one wrong key placement can expose a secret to every viewer.",
    k: ["Configuration in files with restart to apply vs dynamic configuration stored in the database: files are reviewable and reproducible; dynamic settings change instantly and bypass review.", "Strict schema validation at start-up vs lenient loading: strict validation fails fast and blocks a deploy for a typo; lenient loading boots and misbehaves later."],
    p: ["An environment override is applied in the wrong order and production runs with the development database setting.", "A browser-visible configuration key is mistakenly given a secret value."],
    v: "Print the effective configuration with the source of each value, confirm production overrides win, and confirm that the browser payload contains none of the keys classified as secret.",
    dep: []
  },
  "cache-layer": {
    s: "Short-lived storage of expensive or slow results, such as external API responses, search suggestions and permission decisions, shared across portal instances to cut latency and external load.",
    d: "A cache sits in front of external integrations and heavy internal queries, keyed by operation and inputs with a time-to-live. It may be per-process memory or a shared store, which is needed when several instances should see the same entries and respect external rate limits. Plugins use a namespaced client. Invalidation is the hard part: a long time-to-live shows stale schedules and states, a short one defeats the cache, and keys that omit the user can leak one person's results to another.",
    k: ["Shared cache across instances vs per-process memory: a shared cache gives consistent hits and one set of calls to external systems, but is another service to run and fail; per-process caches are simple and fragment.", "Short time-to-live with background refresh vs long with explicit invalidation: short time-to-live is simple and a bit wasteful; explicit invalidation is precise and easy to forget."],
    p: ["A cache key omits the viewer and a restricted result is served to the next user.", "A cache outage makes every request hit slow integrations at once, which then fail."],
    v: "Fetch an integration card twice and confirm the second request is served from cache with no external call, then stop the cache and confirm the page still loads, slowly, without error.",
    dep: []
  },
  "task-scheduler": {
    s: "Runs recurring and one-off background work for all components: ingestion refreshes, search rebuilds, fact collection, report generation and cleanup, with locking so each runs once across instances.",
    d: "Tasks are registered with a schedule or trigger, an identifier and a timeout. A scheduler stores run state in the database and uses leases or locks so that only one instance runs a given task at a time. Failures retry with limits, and runs are visible to administrators. The hard part is coordination: a lock that is never released stops a task forever, a lease that expires during a slow run lets two instances overlap, and clock skew between instances produces both.",
    k: ["Database-backed coordination vs an external queue: the database needs nothing new and limits throughput; an external queue scales higher and is another dependency.", "Fixed cron-style times vs interval from last completion: cron is predictable for reports, but overlaps on slow runs; interval-from-completion never overlaps and drifts."],
    p: ["A crashed instance holds a lock and a recurring job stops running for days without an alert.", "Hundreds of tasks share the same minute and start together, overloading the database."],
    v: "Run three portal instances, trigger a task and confirm exactly one executes it; kill that instance mid-run and confirm another takes over after the lease expires, and that the task history shows both.",
    dep: ["catalog-database","config-system"]
  },
  "event-bus": {
    s: "A publish and subscribe channel carrying events between components, such as entity changed, task finished or score dropped, so they react without calling each other directly.",
    d: "Producers publish events with a topic and payload; consumers subscribe to topics and handle them, with at-least-once delivery. Implementations range from in-process emitters to a database-backed queue or an external broker. Search indexing, notifications and audit consume catalog changes this way. It decouples components. It is hard because of delivery semantics: handlers must tolerate duplicates and reordering, and an event dropped while a consumer was down means permanent drift unless periodic reconciliation exists.",
    k: ["In-process events vs a durable broker: in-process is trivial and loses events on restart and does not cross instances; a durable broker survives and adds infrastructure.", "Events carrying the full entity vs only an identifier: full payloads save a lookup and may be stale or oversized; identifiers force a read and are always current."],
    p: ["A slow consumer blocks the publisher and ingestion slows because notifications are slow.", "Events are lost during a deploy and the search index stays wrong until the next full rebuild."],
    v: "Stop a consumer, publish a hundred events, restart it and confirm that all hundred are handled once each in order per entity, or that duplicates are harmless.",
    dep: ["catalog-database"]
  },
  "schema-migrations": {
    s: "Versioned, ordered changes to the database schema, applied on start-up or by a deploy step, with each plugin owning the migrations of its own tables.",
    d: "Each core and plugin module ships migrations that create or alter its tables, tracked in a table so they run once. Migrations run before the new version serves traffic. Large tables need care to avoid long locks. Rollback is often limited to restoring a backup. The hard problem is coordination in a rolling deploy, where the old and new code run against one schema, and in plugin ecosystems where many independent migrations touch one database and one failing step blocks start-up.",
    k: ["Expand and contract changes vs single-step changes: two-step changes let old and new versions run together safely, and take multiple releases; single-step is simple and needs downtime.", "Migrating at start-up vs a separate deploy step: start-up migration is automatic and races between instances; a separate step is controlled and easy to forget."],
    p: ["A migration that rewrites a large table locks it for ten minutes and all pages hang.", "Two instances start at once and both try the same migration."],
    v: "Run the full migration set against a copy of the production database and confirm it completes within the maintenance budget, with the previous version still passing its checks against the new schema.",
    dep: []
  },
  "portal-telemetry": {
    s: "The portal's own metrics, traces and logs: request latency, ingestion lag, queue depth, error rates and page load times, used to run the portal like a product.",
    d: "Components emit metrics for request rate and latency by plugin, ingestion duration and backlog, search latency, cache hit rate and external call failures. Traces follow a request through the back end and integrations. Front end telemetry measures real page loads. Usage analytics show which pages and plugins people actually use. The hard part is attribution: a slow page involves several plugins and external systems, and without per-plugin labels nobody knows whose card is the problem.",
    k: ["Per-plugin metrics labels vs aggregate only: per-plugin labels show whose code is slow, but raise metric cardinality and cost; aggregates are cheap and point at nobody.", "Collecting usage analytics vs privacy: usage data guides what to retire and improve, but tracks individual behavior and needs aggregation and clear policy."],
    p: ["Ingestion lag grows for days because only request latency was monitored.", "Usage analytics record individual search queries, which can contain sensitive terms."],
    v: "Slow one plugin's API artificially and confirm the dashboards show the latency under that plugin's name, an alert fires on the ingestion lag threshold when ingestion is paused, and traces link the slow page to the plugin call.",
    dep: ["backend-plugin-runtime","config-system"]
  },
  "data-freshness": {
    s: "How current each piece of catalog data must be, and how that currency is measured, communicated and enforced across ingestion, caches, search and integrations.",
    d: "Every layer adds delay: repository to ingestion, ingestion to stitching, stitching to the search index, plus caches on integration data. Each interval is chosen separately, yet people see one answer. Freshness decisions include refresh intervals, event-driven updates, time-to-live on caches and whether pages show a last-updated stamp. It matters most for on-call, deployments and deletions, and least for descriptions. Without explicit budgets, delays add up silently until someone acts on stale data.",
    k: ["Uniform freshness for all data vs per-data-type budgets: uniform is simple, but wastes effort on data that does not matter and under-serves on-call and deployment state.", "Showing freshness timestamps to users vs hiding implementation delay: timestamps help people judge, and add clutter and invite complaints about delay."],
    p: ["An engineer trusts a schedule displayed with a six-hour cache during an incident.", "A deleted service lingers in three places for different amounts of time and each says something different."],
    v: "Change one value in a descriptor, a deployment and a schedule, and measure the time until each appears on the entity page, search and API, and confirm all fall within their stated budgets.",
    dep: ["ingestion-scheduler","cache-layer","search-indexing","event-bus"]
  },
  "catalog-trust": {
    s: "Whether people believe the catalog: built from accuracy, completeness and visible provenance, and lost quickly when a single lookup sends someone to the wrong team.",
    d: "Trust rests on data being right, on known gaps being shown, and on errors being fixable. Mechanisms include required owner fields, validation, orphan reports, freshness stamps, provenance and a simple way to report wrong data. Trust decays faster than it builds: once engineers learn that ownership is often wrong, they stop looking at the portal and ask in chat, after which nobody has a reason to fix the data. The catalog's value is a feedback loop that depends on use.",
    k: ["Showing known gaps and uncertainty vs presenting a clean surface: honest gaps keep trust when data is wrong, but make the portal look unfinished to executives.", "Automated correction vs requiring human confirmation: automation fixes at scale and sometimes wrongly; human confirmation is accurate and slow."],
    p: ["Launch with a half-populated catalog and the first impression is that it is incomplete and not worth checking.", "Wrong ownership data causes a page to reach the wrong team during an incident and engineers stop using the portal."],
    v: "Sample fifty random entities and have each owning team confirm owner, tier and on-call, and confirm the measured accuracy meets the target, with every wrong value traced to the source that produced it.",
    dep: ["owner-model","entity-validation","orphan-detection","stitching-and-merging"]
  },
  "adoption-incentives": {
    s: "Why teams keep their entries accurate: by making the portal useful to them directly, reducing their work, and aligning standards, funding and attention with catalog data.",
    d: "A catalog is maintained by the people who benefit from it, or it decays. Tactics include making descriptors a requirement for deployment, giving owners something in return such as docs hosting and templates, tying scorecards to planning, and showing leadership reports. Mandates alone produce minimal compliance. The choice shapes the product: if the portal is only a compliance database, teams give it the minimum, and if it saves them time, they put effort into it.",
    k: ["Mandating registration vs earning it through value: mandates reach completeness quickly and produce shallow data; value-led adoption is slower and produces better data from people who care.", "Central team curating data vs distributed ownership by teams: central curation is consistent and does not scale; distributed ownership scales and varies in quality."],
    p: ["Teams create entries to pass a gate and never update them, and the data is wrong within a quarter.", "Standards are enforced through scorecards before the portal has given teams anything useful, and they resist it."],
    v: "Track the share of teams that edited their descriptors in the last ninety days for reasons other than a mandate, and the share of portal visits that start from a search or a template rather than a link in a message.",
    dep: ["scorecard-definitions","template-definitions","initiatives-campaigns"]
  },
  "scale-of-catalog": {
    s: "How size changes design: entity counts, relation density, ingestion volume, search load and the number of plugins determine whether simple choices keep working.",
    d: "Hundreds of entities fit in memory, with an embedded search engine and simple polling. Tens of thousands of entities need paging, a real search cluster, incremental ingestion and a tuned database. Hundreds of thousands, as with cloud resources, need partitioning and filtered imports. Costs grow in the number of integrations as well as entities, because each has rate limits. Planning for scale early over-engineers a small portal, while discovering the limits in production means a visible outage of the tool people use in incidents.",
    k: ["Designing for the expected size in two years vs current size: planning ahead avoids rewrites, but pays complexity for load that may never come.", "Limiting what enters the catalog vs scaling to hold everything: limits keep it fast and useful, and omit things people want; scaling accommodates all and costs more to run."],
    p: ["A cloud inventory import multiplies the entity count by a hundred and the portal slows to a crawl.", "A graph page that was fast with 200 entities times out when a system has 5,000."],
    v: "Load a synthetic catalog at ten times the present size, run ingestion, search and the ten heaviest pages, and confirm each remains within its budget, then record the entity count at which the first one fails.",
    dep: ["catalog-database","search-indexing","ingestion-scheduler"]
  },
  "visibility-boundaries": {
    s: "Who may see and change what: the decisions about openness, restricted entities, multi-organization deployments and the data that integrations bring in with their own sensitivity.",
    d: "A portal aggregates data from sources with different access rules. Choosing open by default maximizes discovery and risks exposing sensitive services, while closed by default protects and breaks the point of a catalog. Decisions include which entities are restricted, how search and graphs treat them, which integration data inherits source permissions, and how acquisitions or contractors are separated. The model must be consistent across API, search, notifications and exports, because a leak anywhere defeats the rest.",
    k: ["Open by default with restricted exceptions vs closed by default: open maximizes reuse and discovery, but depends on marking sensitive entities correctly; closed is safe and prevents the portal from helping.", "Portal-level permissions vs inheriting source system permissions: portal rules are simple and uniform, while inheritance is accurate and slow, and needs a credential per viewer."],
    p: ["A restricted project's name appears in a search suggestion drawn from the global index.", "An integration shows incident details to everyone that the incident tool restricts to responders."],
    v: "As users in three different access groups, request the same twenty entities through API, search, graph, notification and export, and confirm each user sees exactly the set their policy permits in every surface.",
    dep: ["entity-level-visibility","permission-aware-results","permission-framework"]
  },
  "extensibility-vs-consistency": {
    s: "The tension between letting teams add their own plugins, kinds and fields and keeping the portal coherent, predictable and supportable by a small platform team.",
    d: "Every extension that makes the portal fit one team also adds surface to maintain, test and keep compatible. Open extension produces a rich ecosystem and an inconsistent product: different look, different failure behavior, overlapping data models. Tight control produces coherence and a platform team that is the bottleneck for all requests. Decisions include what the core owns, what plugins may change, how plugins are reviewed and what happens when a plugin breaks the shared experience.",
    k: ["Open plugin ecosystem vs curated core with few plugins: openness meets diverse needs and spreads maintenance across teams, while curation keeps quality high and slows every team that needs something new.", "Shared data model enforced by the core vs freedom to define fields: enforcement keeps tools interoperable, but frustrates teams whose concepts do not fit."],
    p: ["Fifty plugins each add a tab and the entity page becomes unusable.", "A team forks the portal to add a feature and falls two years behind on security fixes."],
    v: "Measure the page load of the entity page with all plugins enabled, and have a new engineer complete five common tasks, recording clicks and failures, and confirm both stay within the targets agreed for the portal.",
    dep: ["extension-points","plugin-compat-versioning","ui-component-library","entity-kinds"]
  }
});
