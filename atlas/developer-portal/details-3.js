// Details for the developer portal plate, part 3: entity model, ingestion, tool integrations.
ATLAS.details("developer-portal", {
  "entity-kinds": {
    s: "The built-in types of thing the catalog describes: components, APIs, resources, systems, domains, groups, users and templates, each with its own fields and meaning.",
    d: "A kind fixes the shape and meaning of an entity: what a component is, what a resource is, which fields are valid and which relations are expected. A small set of kinds keeps the model learnable. Each kind has a schema and conventions for its type subfield, such as service, website or library. The hard part is drawing lines: engineers argue whether a data pipeline is a component or a resource, and a taxonomy that is too fine makes registration a puzzle, while one that is too coarse makes everything a component.",
    k: ["Few broad kinds with a type subfield vs many specific kinds: few kinds keep queries and pages simple, but push distinctions into free-form values that are harder to validate.", "A fixed core model vs a fully user-defined model: a fixed core makes plugins and scorecards portable, but fits unusual organizations poorly."],
    p: ["Teams register the same thing under different kinds and queries miss half of it.", "A kind is added for one team's need and nobody else's tooling understands it."],
    v: "List counts of entities by kind and type and confirm every entity has a valid kind and a type from the allowed list, with no entity in an uncategorized or unknown bucket.",
    dep: ["entity-validation"]
  },
  "descriptor-format": {
    s: "The text file, kept in a repository next to the code, that declares an entity's kind, name, owner, relations and metadata in a versioned, schema-checked structure.",
    d: "A descriptor has an API version, a kind, metadata such as name, namespace, labels and annotations, and a kind-specific spec. Several entities may share one file. It is parsed, validated against a schema and turned into catalog entities. Putting it in the repository means changes are reviewed and have a history. The difficulty is evolution: format changes must keep old files valid, descriptors are hand-edited so they have typos, and a tiny syntax error hides the entire entity from the catalog.",
    k: ["Descriptors in each repository vs central registration: in-repo files stay accurate because the owning team edits them with the code, but cost a file in every repository and a discovery mechanism.", "Strict schema vs permissive parsing: strict rejection catches errors early, but a typo can erase an entity; permissive parsing keeps entities and loses data quality."],
    p: ["A merge introduces a syntax error and the entity vanishes from the catalog until someone notices a missing page.", "A schema upgrade invalidates thousands of old descriptors at once."],
    v: "Run the validator on a descriptor with a misspelled field and a missing owner, and confirm the pre-merge check fails with line numbers while the last good entity stays visible in the catalog.",
    dep: ["entity-kinds","entity-validation"]
  },
  "entity-references": {
    s: "The scheme for naming and pointing to entities: a kind, namespace and name that identify one entity, and stable references used by relations, owners and plugins.",
    d: "An entity's reference combines kind, namespace and name, compared case insensitively, and is used everywhere: owner fields, dependencies, annotations, URLs and permissions. Short forms may omit parts that can be inferred from context. Some systems also assign an opaque unique identifier to survive renames. The hard problem is renaming: a name used as identity is baked into every reference and bookmark, while an opaque identifier is stable but unreadable, and references that do not resolve may be silently ignored.",
    k: ["Human-readable names as identity vs opaque identifiers: names are readable in descriptors and URLs, but renames break references; opaque ids survive renames and need a lookup everywhere a person reads them.", "Namespaces for scoping vs a global flat namespace: namespaces avoid collisions between teams, but make references longer and invite inconsistent usage."],
    p: ["Renaming a service breaks every dependency reference to it and the graph silently loses edges.", "Two teams register the same name in different namespaces and plugins that ignore namespaces show the wrong one."],
    v: "Rename an entity and confirm all inbound references either resolve through an alias or are reported as dangling with their source, and that its old URL redirects to the new page.",
    dep: ["entity-kinds"]
  },
  "relations-graph": {
    s: "The set of typed, directed links between entities, such as owned by, depends on, provides API, part of, that turns separate records into a navigable graph.",
    d: "Relations come from fields in descriptors and are stored as edges, usually in both directions so each entity can list its dependents as well as its dependencies. Processors add derived edges, such as ownership through a group hierarchy. The graph powers dependency views, impact analysis and scorecard rollups. It is hard because it is only as complete as people make it: missing edges are invisible, stale edges mislead, and graph queries over thousands of nodes are slow in a general database.",
    k: ["Declared relations vs discovered ones from traffic or deployment data: declarations capture intent cheaply but are incomplete; discovered edges are accurate for live behavior and miss rare or planned dependencies.", "Storing both directions vs computing inverses on read: storing inverses makes lookups fast and doubles writes and consistency work."],
    p: ["A critical dependency is never declared and the impact view reports a risky change as safe.", "A reference to an entity that does not exist leaves a dangling edge that breaks the graph page."],
    v: "Choose a service, list its dependents from the graph and compare with the dependents found by scanning declared dependency fields across all descriptors, and confirm the two sets are identical.",
    dep: ["entity-references","stitching-and-merging","catalog-database"]
  },
  "annotations-and-labels": {
    s: "Key-value metadata attached to an entity: labels for grouping and filtering, and annotations that link it to external systems or configure plugins, such as a repository, a dashboard or a docs location.",
    d: "Labels hold short values for selection, while annotations hold arbitrary, longer data such as URLs and identifiers, often with a namespaced key identifying the plugin that reads it. Plugins use annotations to decide whether to show a card and how to query their system. Annotations are the glue between the catalog and every integration. The cost is sprawl: there is no central definition of keys, so typos, duplicates and undocumented keys accumulate and break integrations quietly.",
    k: ["Free-form annotations vs a registry of declared keys: free-form lets plugins add keys without coordination, while a registry catches typos and documents usage at the price of a process.", "Annotations in descriptors vs derived by processors: descriptor annotations are explicit and local, but derived ones such as a repository link need no manual entry and can be wrong."],
    p: ["A misspelled annotation key means the integration card never appears, and nobody gets an error.", "Annotations accumulate with obsolete keys from retired plugins that nobody cleans up."],
    v: "Count annotation keys across the catalog and confirm each is in the declared registry or has a documented owning plugin, and that a deliberately misspelled key is flagged by validation.",
    dep: ["descriptor-format","entity-validation"]
  },
  "lifecycle-and-tiers": {
    s: "Fields that say how mature and how critical an entity is, such as experimental, production or deprecated, and a criticality tier, which drive scorecard scope, alerting and search ranking.",
    d: "Lifecycle records the stage of an entity's life and criticality records how much its failure matters. Both are set in the descriptor, reviewed by the owner, and consumed everywhere: scorecards apply stricter rules to higher tiers, search demotes deprecated entities, and incident tools use the tier to set response urgency. The hard part is honesty: owners rate their own service, and either everything is tier one, which makes the field meaningless, or tiers are set so low that critical services miss the standards.",
    k: ["Owner-assigned tiers vs centrally assigned tiers: owners know the service best, but inflate or understate; central assignment is consistent and needs people with authority and context.", "Few coarse tiers vs many fine ones: few tiers are easy to apply and argue about less, but many services land in one overloaded middle tier."],
    p: ["Everything is labeled tier one, so tier-based rules and alert priority lose all meaning.", "Entities stay in experimental forever, which exempts them from standards they actually carry production traffic under."],
    v: "Compare declared tiers with measured traffic and dependents for production services and confirm that services with the highest dependent counts are not in the lowest tier.",
    dep: ["descriptor-format","entity-validation"]
  },
  "custom-kinds": {
    s: "Lets an organization add its own entity kinds, fields and relations, such as data sets, machine-learning models, teams of teams or customers, without changing the portal core.",
    d: "A custom kind is registered with a schema, allowed relations and an optional page layout, usually through a back end extension point. Processors validate its descriptors, and plugins can render pages for it. Existing features such as search, ownership and scorecards work on it if it follows the basic entity contract. It is hard because every new kind is a commitment: each needs ingestion, pages, permissions, search mapping and documentation, and unmaintained kinds fragment the model.",
    k: ["Extending with custom kinds vs fitting new things into existing kinds: custom kinds fit domain concepts well, but each splits search, rules and tooling; reuse keeps one model with awkward fields.", "Shipping schema with the extension vs a global registry of schemas: shipped schemas are self-contained, but two plugins can define conflicting meanings for one field."],
    p: ["A custom kind is added without a page layout, so entities of that kind show a blank detail page.", "Two plugins register kinds with the same name and the second silently overrides the first."],
    v: "Register a data set kind with a schema, add an entity of that kind, and confirm it validates, appears in search, shows an owner and has a page, while an invalid one is rejected with an error.",
    dep: ["entity-kinds","extension-points","entity-processors"]
  },
  "entity-validation": {
    s: "Checks entities against schema and policy rules before and after they enter the catalog: required fields, allowed values, name formats, reference integrity and organization-specific constraints.",
    d: "Validation runs in three places: in the developer's editor or pull request checks using the same schema, at ingestion in the processor chain, and as periodic audits over the stored catalog. Rules include structural validity, naming conventions, owner existence and tier values. Failures are attached to the entity or the location with a message. The hard question is strictness: rejecting invalid entities protects quality but hides services, so many portals accept them with a visible warning.",
    k: ["Rejecting invalid entities vs accepting with warnings: rejection keeps the catalog clean, but missing services are worse than imperfect ones; warnings preserve visibility and rarely get fixed.", "One shared validator in CI and the portal vs separate implementations: sharing makes pull request checks match ingestion exactly, but couples CI tooling to portal releases."],
    p: ["A pull request check uses an older schema than the portal and passes files the portal later rejects.", "A new organization-wide rule invalidates thousands of entities and the catalog's error list becomes unreadable."],
    v: "Submit one descriptor each with a missing owner, an unknown kind and a dangling reference, and confirm each is reported with the correct message in the pull request check and again at ingestion.",
    dep: []
  },
  "grouping-hierarchy": {
    s: "The higher-level groupings of entities, systems that bundle components and domains that bundle systems, which let people reason about a product or business area instead of hundreds of parts.",
    d: "A system groups components, APIs and resources that together deliver a capability, and a domain groups related systems under a business area. The relations make a tree that supports roll-up views, ownership summaries and cost reporting. Pages show a system diagram from its relations. The challenge is that these groupings are conceptual: there is no automated source for what counts as one system, so the data is hand-curated, disagreement is common and the groupings are the first thing to go stale.",
    k: ["Mandatory system membership vs optional: mandatory membership gives complete roll-ups, but forces arbitrary systems onto small components; optional membership leaves holes in every report.", "Systems defined by architects vs by teams: architects keep boundaries coherent, while team definitions reflect how work really happens and diverge from the architecture."],
    p: ["Hundreds of components list a catch-all system called misc, and roll-ups are meaningless.", "A system's diagram is drawn from declared relations only, and shows a clean architecture that does not match production."],
    v: "Open a system page and confirm that its component and API lists match the entities that declare membership in it, and that the count of components with no system is reported and below the agreed target.",
    dep: ["entity-kinds","relations-graph"]
  },
  "location-registry": {
    s: "The list of places the catalog reads from: repository paths, descriptor URLs and discovery sources, each with its refresh state and the entities it produced.",
    d: "A location is a pointer such as a URL to a descriptor file. Locations are registered through configuration, an administrative action or registration from a template. Each entry stores what was last read, when, and which entities came from it, which is how the system knows what to delete when a file disappears. The hard part is provenance: every entity must trace back to exactly one source location, and two locations producing the same entity create a conflict that must be handled predictably.",
    k: ["Configured static locations vs user self-registration: configuration is controlled and reviewable, while self-registration lowers friction and lets bad or duplicate sources in.", "Tracking entity-to-location provenance vs treating entities as free-standing: provenance enables cleanup and conflict detection, but adds bookkeeping to every write."],
    p: ["A location is unregistered without removing its entities, which then remain as unowned ghosts.", "Two locations declare the same entity and the winner depends on the order in which they were refreshed."],
    v: "Register a location with three descriptors, confirm three entities list it as their source, unregister it, and confirm all three are removed or flagged as orphaned after the next cycle.",
    dep: ["catalog-database","descriptor-format"]
  },
  "repo-discovery": {
    s: "Automatically finds descriptor files across an organization's repositories by scanning or by listening for changes, so teams do not register each service by hand.",
    d: "A discovery provider lists repositories through the version control host's API, searches for the descriptor filename on chosen branches and creates locations for matches. Webhooks trigger a re-read after a push. Filters exclude archived or forked repositories. It brings the catalog close to complete with little effort. The cost is rate limits and scale: scanning ten thousand repositories exhausts API quotas, and a repository without a descriptor is invisible, which is how undocumented systems stay unknown.",
    k: ["Scheduled scanning vs webhook-driven updates: scans are simple and self-healing, but slow and heavy on API quota; webhooks are quick and miss events when the receiver was down.", "Discovering by file presence vs by repository naming or topics: file presence is explicit and precise, while naming conventions find repositories that have no descriptor yet."],
    p: ["The scanner hits the host's rate limit and the discovery of new repositories pauses for hours.", "Forks and archived copies carry the descriptor and appear as duplicate entities."],
    v: "Push a new descriptor to a test repository and confirm the entity appears within the documented delay, then archive the repository and confirm the entity is removed or flagged.",
    dep: ["location-registry","ingestion-scheduler","integration-credentials"]
  },
  "ingestion-scheduler": {
    s: "Decides when each location is refreshed, spreading the work over time, prioritizing recent changes and backing off from failures, so the catalog stays fresh without overloading sources.",
    d: "Each location has a next-refresh time. A worker pool takes due items, fetches the content, runs processors and updates the store. Intervals are set by default or per source; failures back off with jitter. Several portal instances coordinate through the database to avoid duplicate work. The hard parts are fairness and cost: a slow source can monopolize workers, a thundering herd after a restart can overload the database, and a fixed interval wastes work on files that rarely change.",
    k: ["Fixed refresh intervals vs change detection through events or conditional requests: intervals are simple, but waste calls; conditional requests and events save work and add moving parts.", "Per-source concurrency limits vs one global pool: per-source limits protect external systems, but add configuration; a global pool is simple and lets a slow source starve others."],
    p: ["After a restart every location is due at once and the database saturates for ten minutes.", "A failing location retries at a fixed short interval forever and burns an API quota."],
    v: "Restart the portal with ten thousand locations and confirm refreshes spread over the interval, database load stays below the agreed limit and a failing location's retry interval grows.",
    dep: ["location-registry","task-scheduler","catalog-database"]
  },
  "entity-processors": {
    s: "The ordered chain of steps that validate, normalize and enrich each entity as it is ingested, such as filling defaults, resolving owners, adding annotations and emitting relations.",
    d: "Each processor receives an entity with its source location and may emit modified entities, new entities or errors. Typical processors check schemas, apply defaults, translate short references to full ones, derive relations such as owner to group and attach annotations from the repository host. Processors can be added by plugins and run in a fixed order or in stages. Order matters, which makes behavior hard to reason about, and a slow processor delays every refresh.",
    k: ["Ordered pipeline vs independent processors with declared dependencies: an ordered chain is simple to debug, while declared dependencies let teams add processors without understanding global order.", "Enriching at ingestion vs at read time: ingestion enrichment makes reads fast and consistent, but freezes derived data until the next refresh."],
    p: ["A custom processor makes a remote call per entity and turns a ten-minute ingestion into three hours.", "Two processors both set the same annotation and the result depends on their registration order."],
    v: "Ingest a descriptor with a short owner reference and no default lifecycle, then confirm the stored entity has a full owner reference, the default lifecycle and the expected derived relations.",
    dep: ["entity-validation","descriptor-format","relations-graph"]
  },
  "stitching-and-merging": {
    s: "Combines the contributions of many sources about one entity, from descriptors, discovery, processors and push APIs, into a single final entity with provenance for each field.",
    d: "Ingestion writes raw results per source, and a stitching step assembles the final entity by merging them and recomputing relations and the entity's status. It runs on change and is queued so bursts are batched. Conflicts are resolved by precedence, such as descriptor over inferred. The stitched result is what the API and search serve. It is hard because it touches the largest tables and sees every change, and because a deterministic merge needs agreed precedence rules that people can predict.",
    k: ["Stitching eagerly on every change vs lazily on read: eager gives fast, consistent reads but makes bursts of changes expensive; lazy saves work and adds latency to reads.", "Source precedence rules vs last write wins: precedence is predictable and explainable, while last write wins is simple and makes results depend on timing."],
    p: ["A burst of changes queues a backlog and entity pages show data that is hours behind.", "A processor's guess overrides a value the owner set in the descriptor because precedence was reversed."],
    v: "Set the same field from a descriptor and from an inference source with different values and confirm the stored entity holds the descriptor value and the provenance view names both sources.",
    dep: ["entity-processors","catalog-database","relations-graph"]
  },
  "deletion-handling": {
    s: "Decides what happens when a source stops producing an entity, such as a deleted file, an archived repository or a renamed path: removal, orphaning or retention for review.",
    d: "When a refresh no longer yields an entity that a location previously produced, the system compares provenance and marks it for deletion. Immediate deletion risks data loss from a transient failure, so many portals mark entities as orphans for a period, then delete, and notify the owner. Cascades handle relations and search documents. It is hard because absence is ambiguous: a file may be missing because it was removed, because a branch was renamed, or because the host returned a partial list.",
    k: ["Deleting immediately vs a grace period with orphan state: immediate deletion keeps the catalog tidy, but a transient error wipes services; grace periods are safer and leave stale entities visible.", "Removing dependent relations on delete vs keeping dangling ones: removal keeps the graph valid, while dangling edges preserve evidence that something depended on it."],
    p: ["A host outage returns an empty repository list and every entity is marked for deletion at once.", "Entities deleted from the catalog still hold search documents and links for days."],
    v: "Delete a descriptor, confirm the entity shows as orphaned with the owner notified, restore the file before the grace period ends and confirm it recovers with its history, annotations and relations intact.",
    dep: ["location-registry","stitching-and-merging","notifications-inbox"]
  },
  "push-ingestion": {
    s: "An API through which other systems submit or update entities directly, instead of waiting for the catalog to read a file, for sources that have no repository.",
    d: "A caller authenticates, then posts entities with a source identifier. The API validates them, stores them under that source and triggers stitching. A full sync from the same source replaces its previous set, so entities no longer sent are deleted. Typical uses are a cloud inventory, a data catalog or an internal registry. The danger is trust and ownership: any caller can write anything unless scoped, and deletion by omission means a partial upload from a buggy caller deletes entities that are fine.",
    k: ["Push for sources without repositories vs pull for everything: push suits systems that know their own changes, but moves responsibility for correct and complete syncs to every caller.", "Delta updates vs full snapshots: deltas are efficient, but a missed delta leaves permanent drift; snapshots are self-correcting and heavy."],
    p: ["A caller posts a partial list as a full sync and deletes hundreds of entities.", "A shared token lets one team's script overwrite entities owned by another source."],
    v: "Post a full snapshot of 100 entities from a test source, then post one with 99 and confirm exactly one is removed, and that the same caller cannot modify entities that belong to another source.",
    dep: ["service-auth","entity-validation","stitching-and-merging"]
  },
  "ingestion-errors": {
    s: "Surfaces what failed and why during ingestion, per location and entity, with the message, the last good state and the owner, so errors get fixed instead of buried.",
    d: "Fetch failures, parse errors, validation failures and processor exceptions are recorded against the location and, when known, the entity. The portal shows error badges on entity pages for owners, and an error list in the admin console for platform staff, with counts and trends. Previous good data remains until a new valid version arrives. The difficulty is routing: errors are discovered centrally but must reach the person who can fix a repository, and the same failure repeating every cycle must not generate repeated alerts.",
    k: ["Keeping the last good entity on error vs showing the failure state: keeping the last good version avoids outages from typos, but may display data that is wrong for weeks.", "Notifying the entity owner vs the platform team: owners can fix content, but platform staff see systemic problems; most portals need both channels."],
    p: ["A broken descriptor is reported only in an administrative log, and the owning team never learns.", "The same error alerts every cycle, and the owner mutes the channel."],
    v: "Commit an invalid descriptor and confirm the owner is notified once with the file, line and message, the entity page shows the last good data with an error badge, and fixing the file clears both.",
    dep: ["entity-processors","notifications-inbox","owner-model"]
  },
  "ci-integration": {
    s: "Brings build and pipeline state onto entity pages: latest runs, success rates, durations and links, mapped from repositories or pipeline identifiers to catalog entities.",
    d: "A plugin calls the CI system's API using an annotation that identifies the project, and shows recent runs with their status and commit. A back end proxies and caches calls so tokens stay on the server. The same data feeds scorecard facts such as builds pass on the main branch. The hard part is mapping and cost: a pipeline name is not a stable key, one repository may have many pipelines, and polling every project exhausts API limits.",
    k: ["Fetching on page view vs collecting on a schedule: view-time fetching is always fresh but slow and rate-limit prone; scheduled collection is fast and may show last hour's state.", "Showing all pipelines vs the main branch pipeline: all pipelines reflect everything, but feature-branch failures drown the signal people want."],
    p: ["Annotation points at a renamed project and the card shows no builds, which reads as healthy.", "Every page view triggers an API call and the CI provider blocks the portal's token."],
    v: "Trigger a failing build on a test service and confirm the entity page shows it as failed with the correct commit within the refresh window, matching the CI system's own page.",
    dep: ["annotations-and-labels","integration-credentials","cache-layer","backend-plugin-runtime"]
  },
  "deployment-integration": {
    s: "Shows where each entity is deployed and in what state: environments, versions, rollout health and recent changes, sourced from the deployment and runtime platforms.",
    d: "A plugin queries the deployment system or the cluster API for workloads matching an entity, using a label or annotation, and returns versions, replica health and last deployment time. It may link to change history so incidents can be matched to recent deploys. Data is cached to avoid load on clusters. The hard part is identity: workloads must be tagged consistently with the entity name, and any mismatch makes a service look undeployed.",
    k: ["Querying runtime systems directly vs reading from a deployment record store: direct queries show true state but need broad access and are slow; a store is quick and may disagree with reality.", "Per-environment views vs a single status: per-environment is accurate for incidents, while one status is simple and hides that production lags staging."],
    p: ["A workload lacks the identifying label and the portal reports a running service as not deployed.", "The portal's broad read access to clusters is itself a security exposure."],
    v: "Deploy a new version of a test service and confirm the page shows the new version number and rollout state in each environment within the refresh window, matching the platform's own output.",
    dep: ["annotations-and-labels","integration-credentials","cache-layer","backend-plugin-runtime"]
  },
  "oncall-system-integration": {
    s: "Connects the portal to the paging system to read schedules, escalation policies and current assignments, and to trigger or link to pages and incidents for an entity.",
    d: "A plugin authenticates to the paging service, maps entities to services or schedules through annotations, and queries current on-call people, upcoming shifts and escalation rules. It may also offer a button to page the owner. Responses are cached briefly. The difficulty is the identity join: paging systems have their own user and team ids, which must be mapped to directory users, and a mismatch either shows nobody or the wrong person at the moment accuracy matters most.",
    k: ["Mirroring schedules into the catalog vs querying live: mirroring supports offline views and reporting, but can show a stale on-call; live queries are correct and fail with the paging service.", "Allowing page triggers from the portal vs read-only: triggering is convenient in an incident, but invites misuse and false pages."],
    p: ["Users are matched by display name and two people with the same name are swapped.", "Cached schedules are served through an override, and the person who traded shifts is paged anyway."],
    v: "Create a schedule override in the paging system and confirm the portal shows the new person within the cache window; trigger a test page from the entity page and confirm the correct person receives it.",
    dep: ["annotations-and-labels","integration-credentials","backend-plugin-runtime"]
  },
  "cloud-inventory": {
    s: "Imports cloud accounts, resources and their tags into the catalog as resource entities, and links them to the components and owners that use them.",
    d: "A provider calls cloud provider APIs across accounts, lists resources such as databases, queues and buckets, and maps them to resource entities, using tags or naming to infer the owner and the component that uses them. Results are pushed into the catalog and refreshed periodically. It is valuable for cost and security. The hard part is scale and mapping: accounts hold millions of resources, most without useful tags, and an unmapped resource is as invisible as an unregistered service.",
    k: ["Importing everything vs only resource types that matter: importing all gives completeness, but floods the catalog; a selected subset stays useful and misses the long tail.", "Mapping by tags vs by naming convention vs by infrastructure code: tags are explicit and often missing; naming is common and brittle; infrastructure code is accurate and requires parsing it."],
    p: ["Ten million resources are imported and ingestion and search slow for everyone.", "Resources with no owner tag all attach to a default team, which then owns half the cloud estate."],
    v: "Pick fifty random resources from the cloud console and confirm each is in the catalog with an owner, or in the list of unmapped resources, with none missing from both.",
    dep: ["push-ingestion","integration-credentials","owner-model"]
  },
  "issue-tracker-integration": {
    s: "Links entities to their work items: open bugs, incidents and tasks, and lets the portal create tickets for owners, such as campaign work or ownership requests.",
    d: "A plugin queries the issue tracker for work associated with an entity by project, label or component, and displays counts and top items. In the other direction, the portal creates tickets with a template and a link back. Campaign and scorecard systems use it to assign work. The challenge is that trackers vary: different teams use different projects and fields, so the mapping from entity to work is lossy, and a bulk ticket creation can flood a team's backlog.",
    k: ["Creating tickets automatically vs presenting a to-do list in the portal: tickets fit existing team workflows, but can swamp backlogs; a portal list is quiet and often ignored.", "Strict mapping fields vs flexible queries: strict fields give exact counts, but need discipline; queries cope with variety and return noisy results."],
    p: ["A campaign opens one ticket per entity for a team with two hundred entities and buries their backlog.", "Ticket counts are mapped by label and include tickets for other products with similar names."],
    v: "For one entity, compare the number of open bugs shown with the tracker's own filtered count and confirm they match, then create a ticket from the portal and confirm it links back to the entity.",
    dep: ["annotations-and-labels","integration-credentials","backend-plugin-runtime"]
  },
  "security-findings": {
    s: "Imports vulnerability, dependency and secret scan findings from security tools and attaches them to the right entity, with severity and age.",
    d: "Scanners report issues per repository, image or account. A connector fetches them through the tool's API, maps each to an entity and stores summary facts such as the count of critical findings and the oldest unresolved one. Entity pages show the summary and link to details, and scorecards gate on thresholds. It is hard because findings are numerous and noisy: unmapped findings are invisible, duplicates from several scanners inflate counts, and links to details need permissions the portal does not have.",
    k: ["Showing summaries vs detailed findings in the portal: summaries are simple and avoid copying sensitive data, but hide what to fix; details are actionable and expand the portal's security responsibility.", "Deduplicating across scanners vs showing each source: deduplication gives a truthful count, but needs identity rules for findings; per-source views are exact and overstate risk."],
    p: ["Findings from a shared base image count against every service, and all of them show critical.", "A finding disappears because a scanner changed its identifier, not because it was fixed."],
    v: "Introduce a known vulnerable dependency in a test service and confirm a critical finding is attached to the right entity within one scan cycle, and that fixing it clears the count after the next scan.",
    dep: ["annotations-and-labels","integration-credentials","fact-collection"]
  },
  "observability-links": {
    s: "Connects each entity to its dashboards, logs, traces and alerts, showing key health signals and linking to the monitoring system pre-filtered for that service.",
    d: "The catalog stores references to dashboards and queries through annotations or derived from naming. The portal builds deep links, and may embed a summary of error rate, latency and active alerts fetched through the monitoring system's API. This puts the first debugging step one click from the service page. The hard part is consistency: services must be tagged identically in metrics, logs and traces, and every team's dashboards are organized differently, so generic links often land on empty views.",
    k: ["Deep links only vs embedded live data: links are cheap and always current in the source tool, while embedded summaries save a click and make the portal responsible for queries and load.", "Convention-derived links vs explicit annotations: conventions need no per-entity work and break on exceptions; explicit annotations are exact and go stale."],
    p: ["A link opens a dashboard filtered by a service name that differs from the one used in metrics, showing no data.", "Embedded queries run on every page view and add noticeable load to the monitoring system."],
    v: "Open the observability link from ten entities and confirm each lands on a view that already shows data for that service, and that an entity without a mapping shows no link at all."
    ,
    dep: ["annotations-and-labels","entity-pages","backend-plugin-runtime"]
  },
  "incident-integration": {
    s: "Associates incidents with entities and teams, showing active and recent incidents, their severity and postmortems, and feeding reliability facts to scorecards.",
    d: "The incident tool records affected services, severity, timeline and follow-up actions. A connector maps those to catalog entities, caches active incidents and shows them prominently on affected entity pages and dependents. History per entity lets owners see patterns, and reports count incidents per team. The hard part is tagging: affected services are chosen by responders in the middle of an emergency, so the data is incomplete, and counts of incidents penalize teams that report honestly.",
    k: ["Showing incidents on dependents through the graph vs only on the affected entity: dependent views help people diagnose upstream causes, but rely on a complete graph and can add noise.", "Using incident counts in scorecards vs only as context: counts make reliability measurable, but can discourage declaring incidents."],
    p: ["Responders tag the wrong service and the postmortem lands on another team's page.", "Teams avoid declaring incidents because the portal publicly counts them against their score."],
    v: "Open a test incident against a service and confirm it appears on that entity page and on the pages of its declared dependents within a minute, and closes with a link to its postmortem.",
    dep: ["relations-graph","integration-credentials","backend-plugin-runtime","owner-model"]
  },
  "plugin-sdk": {
    s: "The libraries and conventions that let teams write plugins: APIs for registering pages and cards, calling the back end, reading the catalog and checking permissions.",
    d: "The SDK exposes stable interfaces: how to declare a plugin, register routes and extensions, access identity, call other plugins' APIs and write tests. A command-line tool generates a plugin skeleton. The SDK defines the contract that lets plugins be developed outside the portal repository. Its difficulty is stability: any public API becomes a commitment to every plugin author, and breaking it forces all of them to migrate, which is why many portals churn through several generations of the SDK.",
    k: ["Small, stable core SDK vs a large rich one: a small core is easier to keep compatible, but pushes common needs into copied helper code in every plugin.", "Generated plugin skeletons vs documentation only: skeletons make plugins uniform and testable, but fix choices that are painful to change later."],
    p: ["A plugin uses an unexported internal path that works until a minor release removes it.", "The SDK's documentation lags the code and teams learn by reading other plugins' source."],
    v: "Generate a new plugin from the SDK tool, add a page and a back end route without touching portal code, and confirm it loads, authenticates and passes its generated tests.",
    dep: ["extension-points","plugin-compat-versioning"]
  },
  "extension-points": {
    s: "The named places where plugins can add behavior: pages, entity tabs and cards, search sources, processors, actions, permission policies and navigation entries.",
    d: "Each extension point is a typed interface with a name and a registry. The portal core defines them and plugins implement them by registering at start-up. Front end points describe where a component appears and under which condition; back end points accept modules such as processors or collators. A good point is narrow and documented. The hard part is deciding where to put them: too few and teams fork, too many and each becomes a compatibility burden, and ordering between plugins at one point needs rules.",
    k: ["Many fine-grained extension points vs few coarse ones: fine-grained points let plugins integrate precisely, but enlarge the compatibility surface; coarse points are stable and force workarounds.", "Declarative registration vs code that runs at start-up: declarations can be inspected and validated, while code is flexible and can have side effects before the app is ready."],
    p: ["Two plugins extend the same point and their order changes behavior between deploys.", "A plugin registers a heavy extension that runs on every entity page and slows the whole portal."],
    v: "List registered extensions per point from the running portal, then disable one plugin and confirm exactly its extensions disappear and no other plugin's behavior changes.",
    dep: ["plugin-sdk"]
  },
  "frontend-plugin-loading": {
    s: "How the browser gets plugin code: bundled at build time, or loaded at run time from separate bundles so plugins can be added without rebuilding the portal.",
    d: "In the build-time model, the portal's front end is compiled with a list of plugins, which is simple and optimizable. In the run-time model, plugins are published as independent bundles and loaded by a host that shares common libraries. Lazy loading keeps the first page fast. Either way, plugins must agree on shared dependencies. The difficulty is the trade: run-time loading removes the central build and release bottleneck, but multiplies version mismatches and the number of ways a page can break in a user's browser.",
    k: ["Build-time composition vs run-time loading: build-time is simple and testable as one artifact, but every plugin change needs a portal release; run-time loading decouples releases and risks incompatibilities in production.", "Lazy loading per route vs one bundle: lazy loading keeps first load fast, but adds waterfalls and failure points when a chunk cannot load."],
    p: ["Two plugins ship different major versions of a shared library and the page crashes in the browser only.", "The initial bundle grows to many megabytes because every plugin is loaded eagerly."],
    v: "Load the portal with a throttled network and confirm the home page is interactive within the budget, that plugin code is fetched only when its route is opened, and that a missing chunk shows an error in that route only.",
    dep: ["plugin-sdk","ui-component-library","plugin-compat-versioning"]
  },
  "backend-plugin-runtime": {
    s: "The server-side host for plugins: it starts them in dependency order, gives each a database, a logger and configuration, and mounts their APIs under separate routes.",
    d: "Back end plugins export modules that register routes, workers and extensions. The runtime resolves dependencies between them, supplies shared services such as the database, cache, scheduler and identity, and wires everything at start-up. Deployments run all plugins in one process or split them into several. The challenge is blast radius: in one process, a plugin with a memory leak or an unbounded loop affects all others, and splitting into many services multiplies operations work.",
    k: ["Single process for all plugins vs separate deployments: one process is cheap and simple to run, while separate services isolate failures and scale independently at the cost of more infrastructure.", "Shared services injected by the runtime vs plugins building their own: injection keeps conventions and observability uniform, but couples every plugin to the runtime's interfaces."],
    p: ["One plugin's blocking call on start-up delays the readiness of the entire portal.", "A plugin opens its own database connections without limits and exhausts the database for everyone."],
    v: "Start the runtime with one plugin whose start-up throws and confirm the portal reports it as failed with a clear message while other plugins serve requests, or fails fast if configured to.",
    dep: ["plugin-sdk","catalog-database","cache-layer","config-system","task-scheduler"]
  },
  "plugin-config": {
    s: "How each plugin receives its settings: schema-declared options, environment overrides, secrets and per-environment values, validated at start-up.",
    d: "A plugin declares the configuration keys it reads and their types, and the runtime validates them against the merged configuration, rejecting missing or invalid values before serving traffic. Secrets are referenced rather than inline. Front end configuration is a visible subset sent to the browser. The hard part is the boundary: values destined for the browser must not include secrets, and when every plugin reads from one big file, changing one setting needs a full redeploy and mistakes are not isolated.",
    k: ["Schema-validated configuration vs ad hoc reading: schemas catch mistakes at start-up and document options, but require authors to maintain them; ad hoc reading is quick and fails at run time.", "One shared configuration file vs per-plugin files: one file is easy to find and review, but couples ownership; per-plugin files let teams own their settings."],
    p: ["A secret is placed under a key that is exposed to the browser configuration.", "A missing optional setting silently defaults to a value that disables a security check."],
    v: "Start the portal with one required plugin setting missing and confirm start-up fails with the key name, and that no configuration key marked secret appears in the page's configuration payload.",
    dep: ["config-system","backend-plugin-runtime"]
  },
  "plugin-compat-versioning": {
    s: "The rules and checks that keep plugins and the portal core compatible across releases: versioned APIs, deprecation periods, and tests that find breakage before users do.",
    d: "The core and the SDK follow semantic versions with deprecation notices. Plugins declare which API versions they need. Compatibility checks run in CI against several portal versions, and the registry may block incompatible combinations. Migration guides and codemods help authors move. It is hard because plugins are owned by many teams with different priorities, so some will never update, and the portal either carries old APIs indefinitely or breaks them at the cost of losing plugins.",
    k: ["Long deprecation windows vs fast removal: long windows protect plugin authors, but keep old code paths alive and slow the core; fast removal speeds development and strands unmaintained plugins.", "Automated codemods vs manual migration guides: codemods make upgrades cheap and uniform when changes are mechanical, but cannot cover semantic changes."],
    p: ["A core upgrade breaks a plugin that nobody owns anymore, and an important page disappears.", "Compatibility is tested only against the latest portal version, so the plugin breaks for teams one release behind."],
    v: "Run the compatibility suite of three representative plugins against the current and previous two portal versions in CI, and confirm any break names the plugin and the API that changed.",
    dep: ["plugin-sdk"]
  },
  "plugin-isolation": {
    s: "Limits what a plugin can do to the portal and to each other: separate permissions, resource limits, sandboxing of untrusted code and safe handling of failures.",
    d: "In the front end, errors in a plugin component are caught by boundaries so only that card fails. In the back end, plugins share a process unless split, so isolation relies on conventions, namespaced database schemas, scoped tokens for plugin-to-plugin calls and timeouts. Stronger designs run plugins in separate processes or restricted sandboxes. It is hard because the portal holds broad credentials, and a malicious or buggy plugin in the same process can read everything.",
    k: ["Trusting internally reviewed plugins vs sandboxing all plugins: trust is simple and fast, but one compromised dependency exposes every credential; sandboxing contains the damage and limits what plugins can do.", "Per-plugin database schemas vs a shared schema: separate schemas prevent accidental overlap, but make cross-plugin queries and migrations more laborious."],
    p: ["A plugin dependency is compromised and uses the portal's service credentials to read other plugins' data.", "A plugin without a timeout hangs a request and ties up workers until the portal stops responding."],
    v: "Make one plugin throw on every request and loop forever, and confirm other plugins' pages and API calls keep responding, the failing plugin's errors are logged separately and its calls time out.",
    dep: ["backend-plugin-runtime","service-auth","permission-framework"]
  },
  "plugin-registry": {
    s: "The inventory of available plugins with their owners, versions, compatibility and status, used by administrators and developers to find, install and retire plugins.",
    d: "The registry lists each plugin's name, description, owning team, version, supported portal range, configuration needs and usage metrics. It may be a catalog of plugin entities, which lets the portal's own tooling apply to itself. Administrators use it to decide what runs in production; developers use it to find existing integrations before writing new ones. The hard part is lifecycle: plugins are installed readily and retired rarely, so portals accumulate unmaintained plugins that still run with broad access.",
    k: ["A curated registry vs open installation: curation controls quality and security, but creates a gatekeeper and slows teams; open installation encourages contributions and invites duplicated or unsafe plugins.", "Tracking usage metrics per plugin vs not: metrics let you retire what nobody uses, but need telemetry on every page and card."],
    p: ["Three teams write near-identical plugins for the same tool because nobody could find the first.", "A plugin whose owner left the company keeps running with no one responsible for its vulnerabilities."],
    v: "List every installed plugin with its owner and last release date, and confirm each has a live owning team and that plugins with no usage in ninety days are flagged for review.",
    dep: ["plugin-compat-versioning","owner-model","entity-kinds"]
  }
});
