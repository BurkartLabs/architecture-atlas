// Details for the developer portal plate, part 2: documentation and APIs, scorecards, ownership.
ATLAS.details("developer-portal", {
  "docs-as-code-source": {
    s: "Documentation kept as plain-text files in the same repository as the code it describes, reviewed in the same pull requests and linked to the entity by an annotation.",
    d: "Each service's repository holds a docs folder of text files in a lightweight markup, plus a configuration file giving the navigation. A catalog annotation points the entity at that folder, so the portal knows where to build from. Because docs change in the same commit as code, reviewers can ask for both together. Its hard part is culture, not technology: writing is optional work, so docs rot unless the portal makes missing or old documentation visible.",
    k: ["Docs in the code repository vs a central wiki: next to the code they stay reviewable and versioned with it, but are invisible to non-engineers and scattered across hundreds of repositories.", "Strict structure conventions vs free layout: conventions make documents findable and consistent, but feel bureaucratic to authors and discourage contributions."],
    p: ["The annotation points to a folder that was moved, so the entity shows a docs tab that errors.", "A repository has docs, but no entity references it, so they never appear anywhere."],
    v: "Pick ten production services and confirm each entity has a docs annotation whose folder exists at the referenced path and builds without errors.",
    dep: ["annotations-and-labels","repo-discovery"]
  },
  "docs-build-pipeline": {
    s: "Converts source documentation into a static site, either on demand inside the portal or in each repository's CI, with checks that fail on broken links and missing pages.",
    d: "A generator reads the configuration, converts markup to HTML, resolves navigation, builds a search index and emits a folder of static files. Builds run either in CI on each merge, which scales and uses repository-specific tooling, or inside the portal on demand, which needs no CI work but burdens the portal. Outputs go to publishing storage. Difficulty comes from variety: each repository has different plugins, diagrams and dependencies, and an on-demand builder must run untrusted content safely.",
    k: ["Building in each repository's CI vs building in the portal: CI keeps the portal light and lets teams customize, but needs every team to set up and maintain publishing.", "Failing the build on broken links vs warning: failing keeps documentation accurate, but blocks unrelated merges when an external site is down."],
    p: ["Dozens of repositories build with different generator versions, and a rendering fix needs updating everywhere.", "Portal-side building runs plugins from a repository with no sandbox, giving repository authors code execution on the server."],
    v: "Introduce a broken internal link in a docs page and confirm the build fails and names the file and line, then fix it and confirm the published site updates within the stated time.",
    dep: ["docs-as-code-source","ci-integration"]
  },
  "docs-publishing-storage": {
    s: "Stores built documentation sites in object storage under entity-specific paths, and keeps the mapping between entity, version and stored files.",
    d: "After a build, the output folder is uploaded to a storage bucket under a prefix derived from the entity's namespace, kind and name. The renderer fetches pages from there through the portal's back end, which also checks permissions. Metadata such as build time and commit hash is stored beside it. An old site is replaced atomically or by versioned prefix. The hard parts are consistency and cleanup: partial uploads can mix old and new files, and deleted entities leave orphaned sites that nobody removes.",
    k: ["Uploading to a fresh prefix and flipping a pointer vs overwriting in place: pointer flips avoid mixed pages, but cost storage and need garbage collection.", "Serving through the portal back end vs directly from the bucket: the back end can check permissions, but becomes a bottleneck; direct serving is fast and hard to protect."],
    p: ["A partial upload leaves a page whose images belong to the previous build and are now broken.", "Sites for deleted entities remain readable in storage, exposing documentation that was meant to disappear."],
    v: "Publish two builds in sequence while loading a page between them, and confirm every request returns either entirely the old or entirely the new version, never a mixture.",
    dep: ["docs-build-pipeline","entity-references","entity-level-visibility"]
  },
  "docs-renderer": {
    s: "The front end view that displays a stored documentation site inside the portal's frame, rewriting links and styles so it feels native and respects permissions.",
    d: "The renderer fetches generated HTML for the requested page, sanitizes it, rewrites relative links and images to the portal's routes and injects theme styles. It shows navigation, a table of contents, a last-updated stamp and an edit link back to the source. Search results link to the same pages. It is difficult because generated HTML is untrusted content shown inside an authenticated application: scripts must be stripped or sandboxed, and links between entities' docs must resolve across sites.",
    k: ["Sanitized HTML inside the page vs an isolated frame: inline looks native and links smoothly, while a frame gives stronger isolation but awkward scrolling and theming.", "Rewriting generator output vs requiring a portal-aware theme: rewriting works with any site, but is fragile when generator markup changes."],
    p: ["A docs page includes a script that runs with the viewer's session and can call portal APIs.", "Relative links to a sibling entity's docs resolve to a 404 because they assume one big site."],
    v: "Add a script tag and an event-handler attribute to a docs source page, build it, and confirm neither executes in the rendered portal page while text and images appear normally.",
    dep: ["docs-publishing-storage","ui-component-library","theming-and-branding"]
  },
  "docs-versioning-nav": {
    s: "Lets readers see documentation for a specific release or branch and move among pages, sections and related entities with stable navigation and URLs.",
    d: "Versions are built per tag or branch and stored under separate prefixes, with a selector in the renderer. Navigation comes from the source configuration and is rendered as a tree, with canonical URLs that survive page renames through redirects. Entities link to default versions. The challenge is the volume of builds and the question of what default means: readers on an old release need old docs, while most readers want latest, and the two must not confuse each other.",
    k: ["Building every release vs only the default branch: every release helps users of older versions, but multiplies storage and build cost for little-read docs.", "Redirect maps for renamed pages vs letting links break: redirects protect bookmarks and search results, but add maintenance that authors forget."],
    p: ["A reader lands on the latest docs through a search result while running an older release and follows steps that no longer apply.", "Renaming a page breaks hundreds of links from other documents and incident runbooks."],
    v: "Open a page's older version through the selector, confirm its URL contains the version and its content differs from latest, then rename a page and confirm the old URL redirects.",
    dep: ["docs-publishing-storage","docs-renderer"]
  },
  "docs-freshness-checks": {
    s: "Detects stale or missing documentation by comparing last-updated times, broken links and presence of required pages, and exposes the result as data for scorecards.",
    d: "A job inspects each entity's documentation metadata: when it was last built from a change to docs files, whether required pages such as an overview and runbook exist, how many links are dead and whether the build passes. The results become facts on the entity. Owners get a nudge and scorecards use the facts. It is hard because age is a weak proxy: stable documentation may be correct for years, while a fresh edit can be a typo fix on a page that is wrong.",
    k: ["Time-based staleness vs comparing docs changes with code changes: age is trivial to compute, but code-to-docs comparison finds real drift and misfires on repositories with no relationship between them.", "Required pages checks vs quality review: presence checks are automatic and fair, but encourage empty placeholder pages."],
    p: ["Teams add empty pages to satisfy the required-page check, and the portal reports documentation as complete.", "Every stable, correct service is flagged stale and the signal is dismissed."],
    v: "Delete a required runbook page from a test service and confirm its docs fact flips to failing within one collection cycle, and that restoring the page flips it back.",
    dep: ["docs-publishing-storage","fact-collection"]
  },
  "api-spec-ingestion": {
    s: "Discovers and validates machine-readable API descriptions for entities, linking each API entity to its current specification and detecting when the description changes.",
    d: "An API entity points at a specification by URL, file path or repository location. Ingestion fetches it, parses the description format, validates it, resolves references across files and stores the result or a link to it. Changes are detected by hash and can feed diffs. Providers and consumers are related to the API entity in the graph. The hard part is truth: a specification may not match what the running service does, so a precise-looking document can be a confident description of an API that no longer exists.",
    k: ["Specification maintained by hand vs generated from code: generated specifications track the implementation, but are noisy and lack descriptions; handwritten ones read well and drift.", "Storing a snapshot vs fetching live at view time: snapshots are fast and diffable, but live fetching always shows the current file and fails when the source is unreachable."],
    p: ["The portal shows a specification from a branch that never deployed, and consumers call endpoints that do not exist.", "A referenced external file moves and the specification fails to parse, so the whole API page is blank."],
    v: "Change an endpoint in a service's specification, merge it, and confirm the portal's stored API definition changes within the refresh window and that a deliberately invalid description is flagged without erasing the last good one.",
    dep: ["entity-kinds","location-registry","relations-graph"]
  },
  "api-reference-renderer": {
    s: "Renders an API specification as readable reference documentation, with endpoints, schemas, examples and often an interactive console to send test requests.",
    d: "The renderer parses the stored specification and displays grouped operations, parameters, request and response shapes and examples. A try-it console sends requests from the browser or through a proxy, using sandbox credentials. Links connect schemas to related APIs and owners. Rendering large specifications is expensive and slow in the browser. The try-it feature is the risk: it sends real requests with a user's authority, so it can modify production data, and cross-origin rules and credentials make it hard to support well.",
    k: ["Try-it against production vs sandbox only: production tryouts help debugging, but can change real data; sandbox is safe, but requires a maintained sandbox environment.", "Direct browser requests vs a portal proxy: direct requests avoid brokering credentials, but fail on cross-origin rules; proxies work everywhere and must be locked down against abuse."],
    p: ["A proxy for try-it requests can be used to reach internal hosts the user could not otherwise access.", "A very large specification freezes the browser tab while rendering all operations at once."],
    v: "Open the reference for a specification with 500 operations and confirm the page becomes usable within three seconds, and that a try-it request to a sandbox endpoint returns a real response.",
    dep: ["api-spec-ingestion","ui-component-library","service-auth"]
  },
  "api-lifecycle": {
    s: "Tracks each API's lifecycle stage and versions, its consumers and deprecation dates, so teams can see who is affected before changing or retiring an interface.",
    d: "API entities carry a lifecycle such as experimental, production or deprecated, a version and relations to the components that provide and consume them. Consumer data comes from declared dependencies and, when available, from gateway traffic. The portal shows an impact view and deprecation timeline, and scorecards can require a successor for deprecated APIs. It is hard because declared consumers are incomplete: undeclared clients exist, and the first sign of one is a break after the API is turned off.",
    k: ["Declared consumers vs traffic-derived consumers: declarations carry intent and are cheap, but are incomplete; traffic data is complete for live use and misses rare callers.", "Hard cutoff dates vs soft deprecation: hard dates force migration, but break unmapped clients; soft deprecation is safe and often never ends."],
    p: ["An API is retired on its listed date but a quarterly batch job still calls it, and fails weeks later.", "Version labels are free text, so the portal cannot tell that two entities are versions of one API."],
    v: "Mark an API deprecated with a retirement date and confirm every declared consumer's owner is listed in the impact view and notified, and that undeclared callers seen in gateway traffic are flagged too.",
    dep: ["api-spec-ingestion","lifecycle-and-tiers","relations-graph","notifications-inbox"]
  },
  "scorecard-definitions": {
    s: "Declarative descriptions of a standard: a named set of rules, the entities it applies to, its levels or weights and the guidance shown to owners who fall short.",
    d: "A scorecard is stored as configuration or as a catalog entity. It names a scope by kind, tier or labels, lists rules with a description, severity and remediation link, and may define thresholds such as bronze, silver and gold. Changes are reviewed like code. The central difficulty is that a standard is a contract with many teams: a scorecard that applies to everything needs an escape hatch, and one with too many rules at launch is ignored because no team can reach good.",
    k: ["Scoped scorecards per tier vs one for all entities: tiered scoping makes expectations fair, but needs trustworthy tier data and more definitions to maintain.", "Starting with few rules vs a complete standard: few rules get quick wins and trust, while a complete standard documents everything at the cost of a discouraging first score."],
    p: ["A scorecard is applied to every entity including prototypes, and the aggregate score is dismissed as meaningless.", "A rule's remediation link is missing, so teams know they fail but not how to fix it."],
    v: "Create a scorecard scoped to production services, and confirm it appears only on those entities, each failing rule shows a remediation link, and a prototype entity shows no score at all.",
    dep: ["entity-kinds","lifecycle-and-tiers","annotations-and-labels"]
  },
  "rule-evaluation": {
    s: "Runs each scorecard rule against an entity's facts and produces a pass, fail or unknown result with the evidence, on a schedule and on change.",
    d: "Rules are expressions over collected facts, such as has an owner, deploys within seven days or has no critical vulnerabilities. The engine loads facts for each in-scope entity, evaluates every rule and stores results with timestamps and the values seen. It reruns when facts change or on a timer. The hard parts are the unknown outcome and explanation: a missing fact must not read as a pass or a fail, and owners accept a failure only when they can see exactly which value caused it.",
    k: ["Three-valued results including unknown vs binary pass or fail: unknown prevents false verdicts when data is missing, but adds a state that scoring and reporting must handle.", "Event-driven re-evaluation vs a periodic sweep: events are fresh for the changed entity, but a sweep catches rule edits and lost events."],
    p: ["A collector outage turns every rule into a failure and a scorecard run sends thousands of alerts.", "A rule is edited and past results are not recomputed, so the portal shows scores from the old rule."],
    v: "Disable one data source and confirm affected rules show unknown with the reason, not fail, and that restoring the source returns them to their true result in the next cycle.",
    dep: ["fact-collection","scorecard-definitions","task-scheduler"]
  },
  "fact-collection": {
    s: "Gathers the raw data that rules judge, from the catalog, version control, CI, deployments, security tools and documentation checks, and stores it as timestamped facts per entity.",
    d: "Collectors are small jobs, each pulling one kind of data through an integration, such as last deployment time, branch protection state or open vulnerability count, and writing facts keyed by entity. Facts have a freshness and a source. Some are derived from others. Collectors run in batches to respect external rate limits. This layer is the real cost of scorecards: each fact needs an integration, credentials, rate-limit handling and a mapping from external object to catalog entity, which is the most failure-prone step.",
    k: ["Collecting facts in advance vs fetching at rule time: precollection is fast and lets rules combine data cheaply, but stores copies that may be stale.", "One collector per fact vs shared collectors producing many facts: per-fact collectors are simple to reason about, but shared ones save calls to rate-limited systems."],
    p: ["A repository is mapped to the wrong entity and a team is judged on another team's pipeline.", "A collector exceeds an external rate limit and gets blocked, blinding every scorecard that depends on it."],
    v: "For a sample of twenty entities, compare the stored last-deploy fact with the deployment system's own record and confirm they match within the freshness window and map to the right entity.",
    dep: ["ci-integration","deployment-integration","security-findings","task-scheduler"]
  },
  "score-computation": {
    s: "Combines rule results into a score or grade for each entity and scorecard, using weights, severities and gating rules, and keeps history for trend analysis.",
    d: "Computation turns a set of pass, fail and unknown values into a number or level. Typical methods are the weighted fraction of passing rules, or a level reached only when every rule at and below that level passes. Entity scores roll up to teams and systems by averaging or by worst case. The result is stored per run. The hard part is incentive: a score that is easy to push up by satisfying cheap rules misleads, and a mean over a team hides its one failing critical service.",
    k: ["Weighted percentage vs level gating: percentages show gradual progress, but let critical gaps hide behind many passes; level gating is strict and discouraging for a team one rule away.", "Rolling up by average vs by worst entity: averages reflect effort overall, while worst-entity reflects risk, and leaders usually need both views."],
    p: ["A team games the score by satisfying a dozen trivial rules while one security rule stays failing.", "Changing the weights silently moves every team's score and breaks trend charts."],
    v: "Fail only a critical-severity rule on an entity that passes all others and confirm its score is capped below the top level, not rounded up to 95 percent.",
    dep: ["rule-evaluation","scorecard-definitions"]
  },
  "maturity-levels": {
    s: "A staged ladder of expectations, from basic hygiene to excellence, that lets teams see the next step instead of a single overall grade.",
    d: "Levels group rules by progression: level one may require an owner and a repository, level two documentation and a pipeline, level three on-call and runbooks. An entity sits at the highest level for which all rules pass. The portal shows a checklist of what is needed for the next level. Levels make improvement tangible. They are hard to design because the order has to reflect real dependency and effort, and because a single failing rule at a low level can drop an entity back to the bottom and discourage everyone.",
    k: ["Cumulative levels vs independent pillars: cumulative levels give one clear next step, while independent pillars such as security and reliability let teams improve areas separately.", "Public league tables vs private dashboards: visibility motivates, but can shame low-scoring teams, whose scores often reflect legacy rather than effort."],
    p: ["One new rule at level one demotes hundreds of entities overnight and creates a flood of support requests.", "Teams chase level badges and neglect improvements that no rule measures."],
    v: "Pick an entity at level two, view its next-level checklist, fix the one listed failing rule, and confirm its level changes to three after the next evaluation, with the change in history.",
    dep: ["score-computation","scorecard-definitions"]
  },
  "initiatives-campaigns": {
    s: "Time-bound efforts to move many entities toward a standard, such as upgrading a library or adopting a new pipeline, with a target date, owners and progress tracking.",
    d: "An initiative picks a rule, a set of entities, a deadline and a communication plan. The portal computes the progress from rule results, lists the remaining entities by owner and may open tickets or pull requests. Reminders escalate as the date nears. It turns a mandate into a visible queue. The difficulty is capacity: a campaign that hands every team a task at once competes with their roadmap, and without exemptions and clear priorities it becomes noise that managers learn to ignore.",
    k: ["Central tracking in the portal vs tickets in each team's tracker: central tracking shows the whole picture, but work is done elsewhere and the two views can disagree.", "Automated pull requests vs asking teams to act: automation raises completion, but only for changes safe to make mechanically."],
    p: ["Teams receive three overlapping campaigns with the same deadline and complete none.", "Progress counts entities that were deleted or archived, so the target looks met while real services remain."],
    v: "Start a campaign over fifty entities, fix five, and confirm the dashboard shows five of fifty complete within one evaluation cycle, grouped by owner, with the other forty-five still listed.",
    dep: ["rule-evaluation","owner-model","notifications-inbox","issue-tracker-integration"]
  },
  "exemptions": {
    s: "A recorded, time-limited permission for an entity to be excused from a rule, with a reason and an approver, so exceptions are visible rather than hidden.",
    d: "An owner requests an exemption for a rule and entity with a justification and an expiry. An approver, defined by policy, grants or denies it. While active, the rule is shown as waived and excluded from the score but marked in reports. Expiry returns the rule to normal evaluation and notifies the owner. The hard part is abuse: if exemptions are easy and permanent, they become the way to avoid every standard, and the report of exempt entities is the one list that gets examined too rarely.",
    k: ["Mandatory expiry vs open-ended waivers: expiry forces periodic review, but generates renewals; open-ended waivers cause stale exceptions that never get revisited.", "Approval by the standard's owner vs by the entity's management: the standard's owner protects its intent, while management understands the cost of compliance."],
    p: ["Exemptions accumulate until a quarter of entities are exempt from the most important rule.", "An exemption outlives the reason, such as a migration that finished, and is never reviewed."],
    v: "Grant an exemption with a one-week expiry, confirm the rule is shown as waived and excluded from the score, then advance the clock a week and confirm it returns to failing and the owner is notified.",
    dep: ["rule-evaluation","owner-model","audit-log"]
  },
  "scorecard-reporting": {
    s: "Dashboards and exports that show scores by team, system, tier and rule over time, so leaders can see where standards are met and where they are not.",
    d: "Reporting reads stored rule results and scores, aggregates by owner hierarchy and rule, and shows distributions, trends and the biggest gaps. Exports feed external business intelligence. Entity pages show local detail, while organization views show the shape of the problem. The difficulty is accuracy and meaning: aggregates depend on the ownership hierarchy being right, and a trend line is misleading when the underlying rules or entity set changed during the period.",
    k: ["Computing reports live from results vs a precomputed warehouse: live views are current and simple, but slow at large scale; a warehouse supports history and joins and adds a pipeline.", "Showing only scores vs showing per-rule failure counts: scores summarize, but per-rule counts tell leaders which investments would move the most entities."],
    p: ["A team's score drops because entities were reassigned to it, and leaders read it as a decline in quality.", "The report counts entities without an owner under no team, so the worst offenders vanish from every team's total."],
    v: "Choose one team, sum its per-rule failures from the report and compare with its entity pages' failing rules, and confirm the totals match exactly, including entities moved in the last week.",
    dep: ["score-computation","org-hierarchy","catalog-database"]
  },
  "owner-model": {
    s: "Defines what an owner is in the catalog: usually a team or group, referenced from entities, with people, contacts and responsibilities attached to the team rather than to individuals.",
    d: "Entities carry an owner reference that points to a group entity. Group entities have members, a parent, contact channels and sometimes a manager. Owning by team survives individual departures. The model supports a single accountable owner and optional secondary roles such as security or on-call. The challenge is granularity and truth: teams reorganize frequently, and an owner field filled once during onboarding is wrong within a year without a process that makes changes in the organization's source flow into the catalog.",
    k: ["One accountable owner vs several co-owners: a single owner makes escalation unambiguous, but ignores services that are truly shared and hides the second team that does the work.", "Owning by team vs by person: team ownership survives staff changes, but a team with no active members is owned by nobody in practice."],
    p: ["The owner is a team that was dissolved two reorganizations ago, and nobody is accountable.", "A shared service lists three owners, and each assumes one of the others is responsible for incidents."],
    v: "Query all production entities and confirm every one has an owner that resolves to an existing group with at least one active member and a contact channel.",
    dep: ["entity-kinds","entity-references","identity-group-sync"]
  },
  "identity-group-sync": {
    s: "Imports users and groups from the identity provider or directory into the catalog and keeps them current, so ownership and permissions use the organization's real structure.",
    d: "A provider reads the directory through its API or a standard directory protocol, maps users and groups to catalog entities, and records membership and parent relations. It runs on a schedule and may react to change events. Mapping rules decide which groups become teams, because directories contain many groups that are not teams. It is hard because directory data is inconsistent: groups without owners, nested loops, users that leave, and a first sync of tens of thousands of objects.",
    k: ["Importing everything vs only groups matching rules: importing all is simple, but floods the catalog with groups that are not teams; filters keep it clean at the cost of rules to maintain.", "Directory as the only source vs descriptor-defined teams: directory data stays authoritative and consistent with permissions, while descriptors let teams define themselves, but can disagree."],
    p: ["A departed engineer remains in team membership for weeks because the sync only adds and never removes.", "A cyclic group nesting makes the hierarchy computation loop forever."],
    v: "Remove a test user from a directory group and confirm the user disappears from the corresponding catalog team in the next sync, and that entities owned by that team are unaffected.",
    dep: ["authentication","ingestion-scheduler","entity-kinds"]
  },
  "org-hierarchy": {
    s: "The tree of teams, departments and business units, used to roll up ownership, scorecards and cost, and to route escalation to the right management chain.",
    d: "Groups have a parent relation, forming a tree stored in the catalog graph. Queries compute descendants and ancestors so a department view includes all teams beneath it. Reorganizations change the tree, and history may be kept to report across a change. The hierarchy comes from the directory or a human-resources source. The difficulty is that the org chart and the technical ownership do not line up: a service can belong to a platform team that sits in a different department from its main users.",
    k: ["Strict tree vs allowing matrix membership: a tree makes roll-ups unambiguous, but cannot represent teams that serve several departments.", "Storing history of the hierarchy vs only the current tree: history keeps past reports comparable, but requires temporal queries and care in every view."],
    p: ["A reorganization moves a department, and last quarter's reports now attribute old incidents to a team that did not exist.", "A missing parent link detaches a whole branch, which then drops out of every executive rollup."],
    v: "Move a team under a different department in the source, wait for the sync, and confirm the department's entity count and score roll-up change by exactly that team's entities.",
    dep: ["identity-group-sync","relations-graph"]
  },
  "ownership-inference": {
    s: "Suggests or fills in an owner for entities that lack one, using signals such as repository permissions, commit history, code owner files and the team that registered them.",
    d: "A job reads commit authors, review approvers, code owner files and repository admin groups, then maps them to teams through the directory and proposes an owner with a confidence. High-confidence results may be written to a draft descriptor change or a pull request, and lower ones are shown as suggestions for a human to confirm. It is hard because activity is not accountability: the people who wrote the code may have moved on, and the busiest committer might be a bot or a contractor.",
    k: ["Auto-assigning inferred owners vs only suggesting them: auto-assignment closes gaps fast, but wrong owners are worse than none because they receive alerts that are not theirs.", "Code owner files as the signal vs commit activity: owner files express intent but are often stale; commit history reflects reality but includes drive-by changes."],
    p: ["A bot account dominates commit history and the system proposes the bot's team as the owner of fifty services.", "Inferred owners are applied silently, and teams learn they own a service from an incident page."],
    v: "Run inference on twenty entities with known owners and confirm it proposes the correct team for at least 80 percent, with the rest marked low confidence instead of wrong.",
    dep: ["repo-discovery","identity-group-sync","owner-model"]
  },
  "orphan-detection": {
    s: "Finds entities with no owner, an owner that no longer exists or an owner with nobody active, and drives them to resolution before they cause trouble.",
    d: "A check runs over the catalog, resolving each entity's owner reference to a group and the group to current members and contact channels. Entities failing any step are marked orphaned and listed by their last known owner, department and tier. Escalation notifies the former team's manager, then the platform team. Orphans are the first sign of catalog decay. The difficulty is that fixing needs a human decision: someone must accept the entity or retire it, and neither is attractive for an old service.",
    k: ["Alerting managers on orphans vs listing them centrally: manager alerts get decisions, but need accurate hierarchy; a central list is simple and often unread.", "Retiring unowned entities automatically vs requiring a decision: automatic retirement keeps the catalog clean, but can hide a service still carrying production traffic."],
    p: ["An orphaned service keeps running a payment job, and nobody is paged when it breaks.", "The orphan report is so long at launch that nobody works through it."],
    v: "Dissolve a test team that owns three entities and confirm all three appear as orphaned within one cycle with the team's former manager notified, and that reassigning them clears the flag.",
    dep: ["owner-model","org-hierarchy","notifications-inbox"]
  },
  "on-call-routing": {
    s: "Connects each entity's owner to the schedule and escalation policy that tells an incident or a person who to contact, and shows who is on call right now.",
    d: "The catalog stores a reference from the owning team or entity to a schedule in the paging system. The portal queries current assignments through the integration and shows the person on call, the escalation chain and a contact action on the entity page. Other components, such as incident tools, use the same mapping. It is hard because three systems must agree: the directory's team, the catalog's owner and the paging system's schedule, and any mismatch sends a page to the wrong place.",
    k: ["Linking entities to schedules in the catalog vs configuring routing inside the paging tool: catalog links give one place to look and enable scorecards, but add a second mapping to maintain.", "Showing the current on-call person vs only a link: the person is useful in an emergency, but needs live queries and exposes personal details."],
    p: ["The portal shows the previous week's schedule because responses were cached too long.", "A team has no schedule linked, and the entity page offers no way to reach a human at night."],
    v: "Open a production entity page, compare the displayed on-call person with the paging tool's current assignment, and confirm they match; change the schedule override and confirm the portal reflects it within the cache window.",
    dep: ["oncall-system-integration","owner-model","cache-layer"]
  },
  "ownership-transfer": {
    s: "The process and tooling for moving an entity or a whole portfolio from one team to another, with acceptance, history and notifications so responsibility changes explicitly.",
    d: "A transfer is a request naming the entities, the receiving team and a reason. The receiving team accepts it, which creates a change to the descriptor, typically as a pull request, and records an audit entry. Bulk transfers handle reorganizations and departures by applying one mapping to many entities. Open incidents, schedules and permissions may need updating too. It is hard because ownership lives in several places, and a transfer that changes only the catalog leaves alert routing and repository permissions with the old team.",
    k: ["Requiring acceptance vs assigning unilaterally: acceptance prevents dumping a neglected service on a team, but stalls transfers when the receiving team does not respond.", "Editing descriptors in repositories vs changing a database field: descriptor edits keep the repository as source of truth, but need pull requests for every entity; database edits are instant and get overwritten."],
    p: ["The catalog says the new team owns a service but its pager still goes to the old team.", "A bulk transfer maps entities to a team name with a typo and creates an owner that does not exist."],
    v: "Transfer one test entity to a second team and confirm the owner changes in the catalog, the on-call link changes, the audit log records who approved it and the old team receives a notification.",
    dep: ["owner-model","descriptor-format","audit-log","on-call-routing"]
  }
});
