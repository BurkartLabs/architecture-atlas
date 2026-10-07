// Details for the BI & dashboard plate, part 3: exploration and authoring, permissions and security, definition management.
ATLAS.details("bi-dashboards", {
  "ad-hoc-explorer": {
    s: "The workspace where a person drags fields onto shelves, picks a chart and iterates on a question without writing a query.",
    d: "The explorer holds the current question as a structured object: chosen fields, filters, sort and chart. Each change recompiles it into a query through the semantic layer and redraws the result, so iteration takes seconds. It offers sensible defaults such as a date axis for time fields. Save turns the question into a reusable object. The difficulty is staying fast and honest when the dataset is large: previews should sample or limit, and say so.",
    k: ["Run on every change vs run on request: automatic runs make exploration fluid, but cost source queries on every half-formed idea.", "Governed fields only vs allowing raw columns: governed fields keep answers consistent, while raw columns let analysts explore new data but produce unreviewed logic."],
    p: ["An accidental removal of a filter triggers a full table scan that runs for minutes.", "A sampled preview is mistaken for the full answer and screenshotted."],
    v: "Build a question from three fields and two filters, change the grouping five times, and save it. Each step returns within the interactive time target, sampled results are labeled as samples, and the saved question reproduces the final chart exactly.",
    dep: ["field-picker", "query-planner-ir", "chart-type-library", "saved-questions"]
  },
  "field-picker": {
    s: "The searchable list of metrics, dimensions and fields available to an author, with descriptions, types, certification marks and only the entries the user may use.",
    d: "The picker reads the semantic model filtered by the author's permissions, groups fields by entity and shows descriptions, example values and certification state. It suggests compatible fields: those that can legally be joined with the ones already chosen. Search uses names, synonyms and usage popularity. The hard part is scale: thousands of fields need hierarchy, ranking and hiding of deprecated entries, or authors choose by guesswork.",
    k: ["Show every field vs only compatible ones: showing all gives freedom but allows combinations with no valid join, while compatibility filtering prevents errors and can hide a path the author expected.", "Rank by usage vs alphabetical: usage surfaces trusted fields but entrenches popular ones, while alphabetical is predictable and ignores quality."],
    p: ["Deprecated and current versions of a field appear side by side with the same name.", "Field names visible to restricted users reveal the existence of confidential measures."],
    v: "Open the picker as two users with different data permissions and search a synonym. Each sees only allowed fields, certified ones are marked, incompatible fields are hidden or flagged after the first choice, and deprecated ones show a replacement.",
    dep: ["semantic-model-definition", "data-permissions", "glossary-and-certification"]
  },
  "calculated-fields": {
    s: "Author-defined expressions evaluated per row or per group, such as ratios, buckets and conditionals, built from existing fields without changing the source.",
    d: "An expression language offers arithmetic, conditionals, string and date functions, and sometimes window and level-of-detail operations. The expression is parsed, type-checked and compiled into the generated SQL, so it runs at the source. Scope matters: a field saved on one question is local, one promoted to the model is shared. The difficulty is semantics: calculations on aggregated versus row-level values give different answers, and dialect functions behave differently across sources.",
    k: ["Row-level vs post-aggregation expressions: row-level expressions are flexible but may be wrong after grouping, while post-aggregation expressions match the displayed numbers and limit what can be said.", "Local fields vs promotion to the shared model: local fields are fast to create, while promotion keeps logic reusable and requires review."],
    p: ["A ratio field computed per row and then averaged differs from the ratio of sums.", "A function works on one source and fails or changes meaning when the dashboard is pointed at another."],
    v: "Define a ratio field and chart it grouped by a dimension. The chart value matches the ratio of the grouped sums computed by hand, and the expression compiles and runs against at least two different source types.",
    dep: ["calculated-measures", "sql-dialect-compiler", "aggregation-semantics"]
  },
  "saved-questions": {
    s: "Stored queries with their chart settings, owner, parameters and permissions, which are the building blocks that dashboards, alerts and schedules refer to.",
    d: "A saved question stores a structured query (or raw SQL), a visual spec, parameters with defaults, and metadata such as description and collection. Dashboards and alerts embed it by reference, so editing it updates everything that uses it. That reuse is also the risk: an edit can silently change a dozen consumers. Good tools keep versions, list dependents before saving, and distinguish an experiment in a personal space from a shared, certified question.",
    k: ["Reference vs copy when adding to a dashboard: references propagate fixes but propagate mistakes too, while copies are isolated and drift away from the original.", "Personal space by default vs shared by default: personal keeps experiments private and limits discovery, while shared encourages reuse and clutters search."],
    p: ["A colleague edits a shared question to fix their chart and breaks three dashboards.", "Thousands of untitled personal questions make search results useless."],
    v: "Edit a saved question used by two dashboards and one alert. The save dialog lists those dependents, the old version is restorable, and each dependent shows the change after its next refresh.",
    dep: ["dependency-and-impact-tracking", "version-history-and-restore", "metadata-store", "visual-spec-format"]
  },
  "query-builder-ui": {
    s: "A form-style interface for composing filters, groupings and joins stepwise, between drag-and-drop exploration and writing SQL.",
    d: "The builder presents a pipeline: choose a source, add filters, summarize by groups, sort, limit, and optionally join another table or question. Each step is a structured operation, so the whole pipeline compiles to a query and can be inspected. It supports nested questions: the output of one pipeline is the input of the next. It suits authors who know their data but not SQL, and its limit is expressiveness for window functions and unusual joins.",
    k: ["Stepwise pipeline vs single form: pipelines handle multi-stage logic readably, while a single form is quicker for simple questions.", "Escape to SQL available vs not: escape hatches serve advanced needs but move the logic outside governance, while no escape keeps governance and frustrates experts."],
    p: ["A join on a non-unique key silently multiplies rows and inflates sums.", "A deeply nested pipeline compiles to a query that no one can read or tune."],
    v: "Build a three-step pipeline with a filter, a join and a summary. The shown SQL matches the steps, the row counts at each step are inspectable, and a join on a duplicated key produces a visible warning.",
    dep: ["query-planner-ir", "join-path-resolution", "fan-out-protection"]
  },
  "sql-editor": {
    s: "A text editor for writing raw queries against a connected source, with completion, parameters, history and the ability to save the result as a question.",
    d: "The editor offers syntax highlighting, completion from the synced schema, a run button with cancellation, result preview and variables that become dashboard filters. Raw queries bypass the semantic layer, so they need extra controls: read-only credentials, row limits and timeouts, and permissions on which sources an author may use. Their results can still be charted and put on dashboards, so they carry unreviewed definitions into shared views.",
    k: ["Raw SQL allowed vs governed access only: raw SQL serves analysts and one-off needs, but splinters definitions, while governed-only protects consistency and pushes work to the model owners.", "Variables as template text vs bound parameters: template substitution is flexible and invites injection, while bound parameters are safe and limit what can be parameterized."],
    p: ["A parameter substituted as text lets a viewer inject SQL through a dashboard filter.", "A long-running ad hoc query ties up a pooled connection until the source times it out."],
    v: "Run a parameterized query with a filter value containing a quote and a statement separator. The value is treated as data, the query result is correct, and cancelling a long query stops it in the source's running-query list.",
    dep: ["schema-sync", "driver-adapters", "query-cancellation", "query-limits-and-cost-guard"]
  },
  "data-profiling-preview": {
    s: "Quick summaries of a table or field: row counts, null rates, distinct values, ranges and sample rows, to help authors understand data before building on it.",
    d: "Profiles are computed by sampled or approximate queries, cached, and refreshed on a schedule or on demand. They show distributions, top values, null percentage and detected types, and flag suspicious fields such as a date column stored as text. Previews show a few rows with masking applied. The care points are cost on very large tables, so sampling and approximate methods are used, and confidentiality, since distributions and sample values can reveal restricted data.",
    k: ["Sampled profiles vs exact: sampling is cheap and quick but misses rare values, while exact profiles are complete and expensive on large tables.", "Profile on demand vs precomputed: on demand is current and slow, while precomputed is instant and may describe old data."],
    p: ["A profile shows the top values of a personal-data column to a user who cannot query it.", "A sample taken from the head of a table is not representative, and the author builds on false assumptions."],
    v: "Profile a column with a few rare values and a restricted column. Counts and nulls match an exact query within a stated tolerance, the rare values are noted as possibly missed, and the restricted column shows masked values.",
    dep: ["schema-sync", "column-masking", "driver-adapters"]
  },

  "authentication-and-sso": {
    s: "Verifying who a user is: local passwords, federated sign-in through an identity provider, multi-factor checks and service credentials for automation.",
    d: "Most deployments delegate login to a corporate identity provider using standard protocols and map returned claims to users and groups. Sessions are cookies or tokens with expiry and revocation. API clients and schedulers use scoped service tokens. Provisioning protocols can create and deactivate users automatically. Complications include just-in-time account creation, group claims that arrive late or truncated, and keeping long-running jobs from outliving the permissions of the person who created them.",
    k: ["Federated login only vs local accounts also: federation centralizes policy and offboarding, while local accounts help small installs and become unmanaged back doors.", "Short sessions vs long sessions: short sessions limit exposure and annoy people on wall displays, while long sessions are convenient and extend the damage of a stolen cookie."],
    p: ["A person leaves, the identity provider disables them, but their API token and schedules continue to run.", "Group claims are truncated for users in many groups, and they lose access intermittently."],
    v: "Disable a user in the identity provider and measure. Their session ends within the stated time, their personal tokens stop working, and the audit log shows the failed attempts and the deactivation.",
    dep: ["user-and-group-model", "audit-log", "application-api"]
  },
  "user-and-group-model": {
    s: "The records for people, groups, roles and attributes that every permission decision refers to, synchronized from the identity provider where possible.",
    d: "Users belong to groups, groups carry roles and content permissions, and users or groups carry attributes such as department or region used by data rules. Synchronization pulls from the identity provider, resolves nested groups and handles renames. The model must support service principals and external users separately from employees. Hard parts are staleness between a change in the directory and its effect, and attribute quality: data rules are only as good as the attributes.",
    k: ["Groups synced from the directory vs managed in the tool: directory groups give one source of truth, while tool-managed groups fit analytics-specific needs and diverge from policy.", "Roles for capabilities and attributes for data scope vs one combined model: separation keeps rules simple to reason about, while a combined model reduces objects and mixes concerns."],
    p: ["A nested group change in the directory takes a day to reach the tool, and access is wrong in the meantime.", "A free-text attribute with inconsistent spelling makes row rules match nobody."],
    v: "Move a user between two groups in the directory. Within the sync interval their dashboard list and row-level view change accordingly, and the audit log records the membership change with its source.",
    dep: ["authentication-and-sso", "metadata-store"]
  },
  "content-permissions": {
    s: "Rules for who may view, edit, share or administer dashboards, questions, collections and connections, usually inherited down a folder tree.",
    d: "Content lives in a hierarchy of folders or workspaces, and permissions are granted to users or groups at any level and inherited below. Levels typically are none, view, edit and manage. Effective access is computed from direct grants, inherited grants and ownership, and must be evaluated in listing, search and API calls, not just on the page. The trap is that content access does not imply data access: seeing a chart is not the same as being allowed to query its table.",
    k: ["Inheritance from folders vs per-object grants: inheritance is easy to administer and obscure to audit, while per-object grants are precise and unmanageable at scale.", "Deny rules available vs allow-only: denies handle exceptions neatly but make effective access hard to predict, while allow-only is simple and needs more groups."],
    p: ["Search results and autocomplete reveal the titles of dashboards a user cannot open.", "A user with edit rights on a dashboard can change its queries to read data beyond their own permissions."],
    v: "As a user with view-only access, try to open, search for, copy and call the API for a restricted dashboard and for an allowed one. Restricted content is hidden everywhere, and an allowed view does not permit queries on underlying tables.",
    dep: ["user-and-group-model", "metadata-store", "data-permissions"]
  },
  "data-permissions": {
    s: "Rules for which sources, tables, columns and rows a user's queries may touch, enforced when the query is built or by the source itself.",
    d: "Data permissions are separate from content permissions. They can be defined in the tool (a table is available to a group) or inherited from the source's own grants by running queries under the user's identity. The compiler checks every table and column in a request against the permission set before generating SQL. Complications are derived content: a cached result, an extract or a chart on a restricted table is a copy of restricted data, and needs the same rule.",
    k: ["Rules defined in the tool vs reusing the source's grants: tool rules work across sources and duplicate policy, while source grants stay authoritative and require per-user credentials.", "Block the whole query vs silently drop restricted fields: blocking is explicit, while dropping makes charts work and produces misleading partial answers."],
    p: ["An extract of a restricted table is readable by anyone with access to the dashboard that uses it.", "A field removed silently from a result makes a total look lower than it should be."],
    v: "Query a restricted column as a user without access through the explorer, the SQL editor, a drill-through and the metric API. All four are refused with the same explanation, and no source query containing that column appears in the source log.",
    dep: ["user-and-group-model", "query-planner-ir", "query-impersonation"]
  },
  "row-level-security": {
    s: "Filters added automatically to every query so each user sees only the rows their attributes allow, such as their region or customer.",
    d: "A policy maps a user attribute to a predicate on a table or entity, for example region equals the user's region. The compiler injects the predicate into every query touching that entity, including joins, subqueries, drill-through and exports. Alternatively the source database applies native row policies for the user. Predicates also have to be part of cache keys. The risk is the unguarded path: any feature that builds SQL without the compiler can skip the rule.",
    k: ["Predicate injected by the tool vs source-native policies: injection works over any source and depends on every path using the compiler, while native policies protect against all clients and need per-user sessions.", "Default deny when attributes are missing vs default allow: deny is safe and locks out misconfigured users, while allow is convenient and leaks."],
    p: ["A raw SQL question bypasses the compiler and reads all rows.", "A user with an empty attribute is treated as unrestricted and sees every row."],
    v: "Give two users different region values, and run the same chart, its export, a drill-through and a raw question as each. Rows match the policy in all, a user with no attribute sees nothing, and the generated SQL shows the injected predicate.",
    dep: ["query-planner-ir", "user-and-group-model", "cache-key-derivation", "filter-and-parameter-binding"]
  },
  "column-masking": {
    s: "Hiding or transforming sensitive columns for users who may use a table but not see certain values: partial masks, hashing, bucketing or nulling.",
    d: "A masking rule attaches to a field and applies by role: show in full, show partially such as the last four digits, show a hash that still allows counting distinct values, or return null. The compiler rewrites the select list accordingly, so the unmasked value never leaves the source for unauthorized users. Masked fields still need to work in filters and joins without letting a user infer the hidden value by filtering on it repeatedly.",
    k: ["Mask at the source vs in the tool: source masking is airtight for every client, while tool masking works across sources and must cover every path.", "Hash vs null: hashing keeps counts and joins working, but low-cardinality values can be reversed, while null is safe and breaks analysis."],
    p: ["A user filters a masked salary column with greater-than conditions and infers values one by one.", "A tooltip or export reads the raw field through a separate path."],
    v: "Select a masked column as a restricted user in a chart, tooltip, export and drill-through. No path shows the raw value, a hashed field still supports distinct counts, and a range filter on it is refused or limited.",
    dep: ["query-planner-ir", "data-permissions", "sql-dialect-compiler"]
  },
  "query-impersonation": {
    s: "Running a query under the identity of the end user, or a named role, at the source database so its own access controls and audit logs apply.",
    d: "The tool obtains a credential or session for the user: stored per-user secrets, a token exchanged with the identity provider, or a session variable set before the query. The source then applies its grants and policies and records the real user. Pooling is harder, since connections are tied to identities, so tools keep per-identity pools or set the role on a shared connection and reset it afterward. Background jobs need a defined identity, as there is no logged-in person.",
    k: ["Per-user identity vs shared service account: per-user identity gives true source auditing and policies, while a shared account allows pooling and caching and moves enforcement into the tool.", "Set role on pooled connection vs dedicated connection: role switching is efficient, but a failure to reset leaks one user's rights to the next request."],
    p: ["A pooled connection keeps the previous user's role after an error, and the next query runs with it.", "Per-user credentials expire, and scheduled reports fail overnight."],
    v: "Run the same query as two users from a pool of one connection, with an error injected between. The source log shows the correct identity for each, and the second user never receives data permitted only to the first.",
    dep: ["credential-storage", "connection-pooling", "authentication-and-sso"]
  },
  "audit-log": {
    s: "A tamper-resistant record of who viewed, queried, exported, changed or shared what and when, with the query text and the rows or size returned.",
    d: "Events are written for logins, content changes, permission changes, queries, exports and schedule runs, with user, object, time, source and outcome. Logs go to an append-only store and can be exported to external monitoring. Volume is high because every dashboard view runs many queries, so events need sampling rules for low-risk reads and full detail for exports and permission changes. Logs themselves can contain sensitive values in filters, so access is restricted.",
    k: ["Log every query vs log sensitive actions only: full logging allows investigation and costs storage and privacy exposure, while selective logging is small and has gaps.", "In the application database vs an external append-only store: the application database is easy, while an external store resists tampering by administrators."],
    p: ["A query log records filter values containing personal data and is readable by all administrators.", "Logs rotate after thirty days, but an investigation needs ninety."],
    v: "Perform a view, an export, a permission change and a failed access as a test user. Each appears within a minute with user, object, outcome and query text, and an administrator cannot edit or delete the entries from the tool.",
    dep: ["metadata-store", "authentication-and-sso"]
  },
  "usage-analytics": {
    s: "Statistics about the tool itself: which dashboards are opened, by whom, how long they take to load and which content is stale or abandoned.",
    d: "Derived from the audit log and query timings, usage data feeds a popularity ranking, an unused-content cleanup, and performance work: the slowest and most expensive queries by dashboard and by user. It also supports trust decisions, showing which questions the organization really relies on. It must be aggregated respectfully: individual viewing behavior is personal data in many jurisdictions. Often the tool's own data is shown in its own dashboards.",
    k: ["Named usage vs aggregated usage: named data allows follow-up with owners, while aggregates protect privacy and cannot identify who depends on a broken chart.", "Rank by views vs by dependents: views show attention, while dependents such as alerts and embeds show real reliance."],
    p: ["Deleting dashboards with no recent views removes a quarterly report that is used four times a year.", "Cost attributed to the dashboard owner instead of the viewers distorts which workloads are expensive."],
    v: "Open a dashboard thirty times from three users and let one tile run slowly. The usage view shows thirty views, three viewers, the median and 95th percentile load times, and attributes the slow tile's query cost to that tile.",
    dep: ["audit-log", "observability-and-health", "metadata-store"]
  },

  "definitions-as-code": {
    s: "Storing dashboards, questions, models and metrics as text files in a defined format, so they can be edited, reviewed and generated like source code.",
    d: "Each object serializes to a stable text format with references by name or stable id. Tools can read these files to create or update objects and write them back after UI edits. Stable serialization with sorted keys and no volatile fields keeps diffs small. The difficulty is round trips: the UI and the files both edit the same objects, so there has to be one source of truth, and identifiers must survive renames or links break.",
    k: ["Files as source of truth vs the application database as truth: files give review and history, while database-first is simpler for casual authors and exports files only on request.", "Stable ids vs name references: ids survive renames but are unreadable, while names are readable and break links on rename."],
    p: ["The UI writes timestamps and ordering into files, so every save produces a noisy diff.", "A file edited by hand has a reference to a removed field and loads halfway."],
    v: "Edit a dashboard in the UI, export to files, change one title in the file, and import it back. The diff of the export shows only the intended changes, the import updates in place without creating a copy, and references stay valid.",
    dep: ["semantic-model-definition", "visual-spec-format", "metadata-store"]
  },
  "version-control-sync": {
    s: "Two-way synchronization between the tool's content and a version control repository, with branches, commits and pull requests as the way to change shared definitions.",
    d: "A sync service writes changes from the tool to a branch, and pulls merged changes from the repository into the tool. Branches map to authoring spaces. Conflicts arise when someone edits in the UI while a branch changes the same object, and the tool must pick a policy: reject, last writer wins or ask. Review and automated checks run in the repository's normal workflow. Credentials for the repository live in the secret store.",
    k: ["Repository to tool only vs two-way: one-way is simple and forces all changes through review, while two-way allows UI editing and brings merge conflicts.", "Branch per author vs per environment: branch per author isolates work and creates many spaces, while branch per environment is simple and shares unreviewed edits."],
    p: ["A UI edit in production is overwritten by the next sync, and the author never learns why.", "Large merges import content in an order that creates dangling references temporarily."],
    v: "Open a pull request changing one metric, merge it, and watch the tool. The change appears in the target environment within the sync interval, a conflicting UI edit is flagged, and the commit history shows who changed what.",
    dep: ["definitions-as-code", "credential-storage", "environments-and-promotion"]
  },
  "environments-and-promotion": {
    s: "Separate development, staging and production instances or spaces, with a controlled path for moving definitions between them and remapping connections.",
    d: "Authors build in a development space against test data, then promote reviewed content to production. Promotion rewrites environment-specific values such as connection names, and checks that every dependency exists in the target. Automated checks can run the saved questions against staging and compare results with expectations. Some deployments use one instance with spaces, others separate instances, which isolate failures and complicate synchronization.",
    k: ["Separate instances vs separate spaces: instances isolate risk and doubling operations cost, while spaces are cheap and share a single failure domain.", "Promote content only vs content plus its data model: content-only is simple and breaks if the model differs, while promoting both is consistent and heavier."],
    p: ["A dashboard promoted to production still points at the development connection.", "Permissions are not promoted with content, so production dashboards open with default access."],
    v: "Promote a dashboard and its dependent question to staging with a different data source. The connection is remapped, all dependencies resolve, a validation run compares tile results with expected values and fails if a tile errors.",
    dep: ["version-control-sync", "connection-registry", "dependency-and-impact-tracking"]
  },
  "content-diff-and-review": {
    s: "Showing exactly what changed between two versions of a dashboard or definition, in terms people can review: fields, filters, definitions and rendered output.",
    d: "A structural diff compares the serialized objects and reports additions, removals and edits in readable form, such as metric formula changed, filter added. Better tools also run the old and new versions and show changed numbers, which is the real review question. Review checks can enforce rules, for example a certified metric cannot change without its owner's approval. Without this, changes to definitions get approved by glancing at a text diff.",
    k: ["Diff of definitions vs diff of results: definition diffs are fast and exact, while result diffs show the effect on numbers and cost queries to produce.", "Automated policy checks vs human review only: automation is consistent and rigid, while humans catch intent and are inconsistent."],
    p: ["A one-character change in a join condition looks trivial in a text diff and doubles revenue.", "A diff of generated files shows hundreds of unrelated changes after a tool upgrade."],
    v: "Change one metric's filter and open the review view. It lists the changed definition, the dependents affected, the old and new values for three sample slices, and requires the metric's owner to approve before merge.",
    dep: ["definitions-as-code", "dependency-and-impact-tracking", "glossary-and-certification"]
  },
  "dependency-and-impact-tracking": {
    s: "A graph of which charts, questions, alerts and embeds depend on which metrics, fields and tables, used to warn before a change breaks something.",
    d: "The graph is built by parsing definitions and compiled queries: a chart references a question, which references fields, which map to columns. A change request traverses the graph to list affected objects and owners. It also feeds column-level lineage to external catalogs. It is hard to keep complete: raw SQL needs a parser per dialect, and dependencies through parameters or dynamic expressions are only known at run time.",
    k: ["Parsed lineage vs run-time observed lineage: parsing finds dependencies before they run but misses dynamic ones, while observation is exact for what ran and misses rarely used paths.", "Object-level vs column-level lineage: object-level is easy and coarse, while column-level answers the real question and needs deep parsing."],
    p: ["Raw SQL not covered by the parser leaves out a dashboard, and a column removal breaks it.", "The graph is rebuilt nightly, so a change made this afternoon is not visible to reviewers."],
    v: "Ask for the dependents of one source column. The list includes a modeled field, a question defined with raw SQL, a dashboard tile and an alert, each with an owner, and removing the column in staging fails the corresponding validations.",
    dep: ["semantic-model-definition", "saved-questions", "metadata-store"]
  },
  "version-history-and-restore": {
    s: "Automatic snapshots of each saved dashboard, question and definition, with who changed it and the ability to view, compare and roll back.",
    d: "Every save stores a full or delta copy with author, time and optional message. Users can open an earlier version, compare it to the current one and restore it, which creates a new version rather than rewriting history. Retention rules trim old snapshots. Restoring a dashboard may refer to objects that no longer exist, so the restore must check references, and restoring a question changes every consumer at once.",
    k: ["Full snapshots vs deltas: snapshots are simple and fast to restore but use more space, while deltas are compact and slower and depend on an intact chain.", "Restore as a new version vs rewinding: new versions keep an honest history, while rewinding is tidier and destroys evidence."],
    p: ["A restore brings back a version referencing a deleted field and the dashboard shows errors.", "Retention deletes old versions needed for an audit of a past number."],
    v: "Edit a dashboard three times, restore the first version, then view the history. A fourth version exists with the first version's content, the diff against the third lists the three changes, and any broken references are reported at restore time.",
    dep: ["metadata-store", "visual-spec-format"]
  },
});
