// Details for the feature store plate, part 1: definitions and registry.
ATLAS.details("feature-store", {
  "entity-definitions": {
    s: "Declares the things features describe, such as a user or a device, with a name, a join key and a type, so every feature about the same thing is retrieved with the same key.",
    d: "An entity names a join key and its data type, and every feature view attaches to one or more entities. Retrieval, joins and online storage are all keyed by it. Composite entities, such as a user-and-merchant pair, are allowed but multiply storage and complicate lookups. The definition also fixes key semantics: whether the key is a stable surrogate or an identifier that the source system can reassign. Getting the entity wrong is expensive because every downstream table is organized around it.",
    k: ["Surrogate keys versus natural keys: surrogates survive upstream renames and reuse, but need a mapping step at ingestion and one more thing to keep correct.", "Composite entities versus separate single-key views: composites capture interactions directly, but cause key explosion and sparse lookups, and each combination must be materialized."],
    p: ["Two teams define the same real-world thing under different keys, so their features cannot be joined without a hidden mapping.", "A key type changes from integer to string upstream and silently stops matching stored rows."],
    v: "Retrieve features from two different views for the same entity value and confirm both return rows. Then pass a key of the wrong type and confirm the call fails with a clear error, not empty values.",
    dep: ["metadata-registry"]
  },
  "feature-definitions": {
    s: "Declares one named, typed feature: its data type, description, owner, tags and the column or expression that produces it. This is the unit that people and models refer to.",
    d: "A feature definition gives a stable name, a value type including nullability and array shape, and documentation. It binds to a column in a source or to the output of a transformation. The name is the contract with every model that reads it, so renaming is a breaking change. Types matter beyond documentation: the offline store, online row format and serving response must all agree on them. Definitions are stored in the registry and referenced by feature views and services.",
    k: ["Strict types versus permissive types: strict types catch drift at write time, but force a coordinated migration whenever the upstream column widens.", "Descriptive names versus namespaced names: namespacing prevents collisions across teams, but long names make logs and model code awkward."],
    p: ["A feature is redefined under the same name with different semantics, such as a window changing from 7 to 30 days, and models keep consuming it unchanged.", "Nullability is not declared, so missing and zero look identical to the model."],
    v: "Read the feature's type from the registry, the offline table schema and an online response; all three must agree. Rename the feature in a branch and confirm the plan reports every dependent service as affected.",
    dep: ["entity-definitions", "metadata-registry"]
  },
  "feature-views": {
    s: "Groups features computed from one source and attached to one entity, with a shared freshness target and storage policy. It is the unit that is materialized, stored and served.",
    d: "A feature view ties together a source, an entity, a set of feature definitions, an optional transformation and a time-to-live. Materialization jobs run per view, offline tables and online rows are laid out per view, and freshness is measured per view. Views can be batch, streaming or on-demand. Grouping decides blast radius: a view with many unrelated features recomputes all of them when one changes, while many tiny views multiply jobs and lookups.",
    k: ["Wide views versus narrow views: wide views read each source once and serve in one lookup, but any change recomputes everything and one slow feature delays the rest.", "One view per source versus one per use case: per-source reuse is cheaper, but per-use-case views let teams change independently."],
    p: ["Features with very different refresh needs are put in one view, so the hourly ones are only as fresh as the daily ones.", "Dozens of tiny views cause a lookup fan-out that blows the serving latency budget."],
    v: "Apply a view, run its materialization, and confirm the offline table and online rows exist for its entity, and that the freshness reported for the view matches the latest source timestamp.",
    dep: ["entity-definitions", "feature-definitions", "batch-sources"]
  },
  "transformation-code": {
    s: "The code or query that turns source columns into feature values, kept in version control next to the definition so it is reviewed and executed the same way everywhere.",
    d: "Transformations are expressed as SQL, dataframe operations or functions over rows, and attach to a feature view. The store runs them in the batch engine, the stream engine or at request time depending on the view type. Good definitions are pure functions of their inputs and an as-of time, so they are repeatable. Code that calls external services, reads the clock or relies on unordered iteration produces values that differ between runs and cannot be backfilled.",
    k: ["Declarative transformations versus arbitrary code: declarative ones can be translated to several engines and optimized, but cannot express every feature.", "Transformations inside the store versus in upstream pipelines: inside gives lineage and consistency, upstream keeps existing team ownership and tooling."],
    p: ["A transformation reads the current time directly, so a backfill produces values that depend on when the job ran.", "Logic is copied into a serving service for speed and the two copies drift apart."],
    v: "Run the transformation twice for the same as-of time and compare outputs row by row; they must be identical. Run it in both batch and online paths for sample entities and compare.",
    dep: ["feature-definitions", "shared-transform-logic"]
  },
  "feature-services": {
    s: "Bundles the features one model needs into a named, versioned set, so a model asks for a service and gets the same list at training and at inference.",
    d: "A feature service lists features, possibly from several views and including on-demand ones, and may rename or subset them. Models bind to the service, not to individual features. The registry records which models use which services, which makes impact analysis possible. The service version is the contract: adding a feature to the list changes the model input and should create a new version, while changing a view underneath it should be visible in the plan.",
    k: ["Model-owned bundles versus shared feature lists: model-owned bundles isolate changes, but duplicate selections and make cross-model cleanup harder.", "Pinning feature versions in the service versus following latest: pinning is reproducible but needs explicit upgrades, while following latest is convenient but silently changes inputs."],
    p: ["A feature is added to the bundle for a retrained model while the old model still reads the same bundle name and breaks on the extra column.", "No record links the deployed model to its service version, so rollback restores the model but not its inputs."],
    v: "Fetch the same service for training and online serving and confirm identical feature names, order and types. Check the registry lists the model as a consumer of that service version.",
    dep: ["feature-views", "metadata-registry", "definition-versioning"]
  },
  "definition-validation": {
    s: "Static checks run on definitions before they are applied: valid references, consistent types, resolvable sources, naming rules and detection of breaking changes against what is already deployed.",
    d: "Validation parses definitions, resolves every reference to entities, sources and views, and checks that types line up and that transformations produce the declared outputs. It diffs against the live registry to flag renames, type changes and removed features that downstream services depend on. Some checks run a transformation on a small sample to confirm the schema it emits. Hard parts are cheap checks that catch real mistakes and checks that need credentials to inspect external sources.",
    k: ["Static checks only versus checks that touch real data: static checks run anywhere and fast, but miss schema drift in the source that only a live query reveals.", "Blocking versus advisory rules: blocking prevents bad changes, but teams route around rules that produce false positives."],
    p: ["Validation passes against a stale cached copy of the registry and misses a conflicting change merged earlier.", "A breaking-change check compares names only, so a changed meaning under the same name goes through."],
    v: "Submit a definition that removes a feature used by a deployed service and confirm validation fails naming that service. Submit a valid change and confirm it passes without touching production data.",
    dep: ["metadata-registry", "lineage-graph"]
  },
  "plan-and-apply": {
    s: "Computes the difference between declared definitions and deployed state, shows what would change, and applies it, creating tables, jobs and registry entries.",
    d: "The planner compares the repository's definitions to the registry and the infrastructure, then lists additions, updates and removals, with the effects: new tables to create, jobs to schedule, stores to rewrite. Apply performs them in dependency order and records the outcome. It is typically run from continuous integration, so the repository is the source of truth. The difficulty is partial failure: a table created and a job not leaves a state the next plan must understand.",
    k: ["Declarative apply versus imperative commands: declarative state is reviewable and repeatable, but destructive removals need guard rails because the diff alone can delete data.", "Apply from a laptop versus from CI only: laptops are quick, CI gives an audit trail and consistent credentials."],
    p: ["Removing a view from the repository deletes its online data in one apply, with no pause for the models still reading it.", "Two people apply conflicting changes concurrently and the later one silently overwrites the earlier."],
    v: "Make a one-line change, run plan and confirm it lists exactly that change. Apply, then run plan again and confirm it reports no differences.",
    dep: ["definition-validation", "metadata-registry", "configuration-and-deploy", "approval-gates"]
  },
  "authoring-sdk-cli": {
    s: "The programmatic library and command line that people use to define features, run plans, retrieve training data and test transformations from notebooks or pipelines.",
    d: "The SDK exposes the same definitions, retrieval calls and registry queries as the services, in the languages data teams use, and the command line wraps apply, materialize and listing for scripts and CI. A good SDK allows local runs against small data so that definitions can be tested without a cluster. It must keep versions compatible with the deployed services, because definitions authored with a newer client than the registry understands can corrupt state.",
    k: ["Thin client versus rich client: thin clients stay compatible with servers across upgrades, rich ones can validate and run locally but need frequent upgrades.", "Local execution mode versus cluster-only: local execution gives fast iteration, but its behavior can diverge from the production engine."],
    p: ["A notebook pins an old client that writes definitions in a format the new registry reads incorrectly.", "Local mode uses a different engine, so a transformation passes on a laptop and fails on the cluster."],
    v: "From a clean environment, install the client, define a view, run it locally on a sample and then against a staging registry; results from both must agree on the same inputs.",
    dep: ["metadata-registry", "feature-definitions"]
  },
  "metadata-registry": {
    s: "The database of record for entities, features, views, services, sources and their relationships. Every other component reads it to learn what exists and how it is configured.",
    d: "The registry stores definitions plus operational state such as last materialization time, owner and tags. It is read by the serving layer on startup and on change, by the training builder for every request, and by monitoring. Backing it with a transactional database makes updates atomic; storing it as files in object storage is simpler but makes concurrent writes risky. Reads are frequent and must tolerate registry unavailability, so consumers cache it.",
    k: ["Transactional database versus file-based registry: a database gives atomic updates and queries, but is one more service to run; files are simple but need locking.", "Push versus pull cache refresh: push propagates changes quickly but adds a failure path, pull is simple but leaves consumers stale for the interval."],
    p: ["Serving instances cache different versions of the registry for several minutes, so some return a new feature and some do not.", "A registry outage blocks online serving because the cache was not allowed to serve stale entries."],
    v: "Apply a change, then query every serving instance for the new feature and measure how long until all return it. Stop the registry and confirm serving still answers from its cache.",
    dep: []
  },
  "feature-search": {
    s: "Search and browse across the catalog by name, description, tag, owner, entity or data source, with the usage and quality context needed to decide whether to reuse a feature.",
    d: "An index over registry metadata supports text search, filters and facets, and ranks results using signals such as how many models use a feature, recent freshness and owner. Reuse is the main economic reason for a feature store, and it fails when people cannot find existing features or cannot tell which of three similar ones is maintained. Descriptions are the weakest data: search quality depends on authors writing them.",
    k: ["Search over metadata only versus including statistics: metadata search is cheap and always current, adding statistics helps judge quality but needs a pipeline to keep them fresh.", "Open browsing versus access-filtered results: filtering protects restricted features, but hides useful reuse candidates and can lead to duplicates."],
    p: ["Results show deprecated features equally ranked with maintained ones, so new models adopt features that are about to be removed.", "Index updates lag registry changes, so a newly applied feature cannot be found for hours."],
    v: "Add a feature with a unique description phrase and confirm it is found by search within the documented delay. Deprecate it and confirm it is marked or demoted in results.",
    dep: ["metadata-registry", "ownership-and-docs", "usage-tracking"]
  },
  "ownership-and-docs": {
    s: "Records who is responsible for each feature and view, and holds descriptions, units, caveats and contact information, so questions and incidents reach someone.",
    d: "Every view carries a team owner and an on-call contact, and every feature a description with units and expected ranges. Owners get monitoring alerts and deprecation notices, and approve access requests. Documentation can be partly generated from definitions, such as types and lineage, while the meaning of a feature has to be written. Ownership decays when people change teams, so stale owners need detection.",
    k: ["Team ownership versus individual ownership: teams survive reorganizations, individuals have clearer accountability but leave behind orphaned features.", "Required documentation versus optional: required fields raise catalog quality, but encourage placeholder text that passes the check."],
    p: ["The listed owner left the company a year ago and alerts go to nobody.", "Descriptions say what the column is named, not what it means, such as the window and the treatment of nulls."],
    v: "Pick ten random features and confirm each has an owner who is currently active and a description that states window, units and null handling. Send a test alert and confirm the owner receives it.",
    dep: ["metadata-registry"]
  },
  "lineage-graph": {
    s: "Tracks how data flows from sources through transformations and views to services and models, so a change or incident can be traced forward to what it affects and backward to its origin.",
    d: "Lineage is built from definitions: a feature depends on a view, which reads sources and other features, which are consumed by services and recorded model versions. Forward traversal answers which models are affected by a source change, backward traversal answers where a suspicious value came from. Definition-derived lineage is accurate for declared dependencies but misses undeclared reads inside custom code, which is why some stores also collect runtime lineage.",
    k: ["Declared lineage versus observed lineage: declared is cheap and consistent, observed catches hidden dependencies but needs instrumentation and can be noisy.", "Column-level versus table-level lineage: column-level supports precise impact analysis, but is expensive to compute through arbitrary code."],
    p: ["A transformation reads a table that is not in its declared sources, so a change to that table affects models with no warning.", "The graph is only updated when definitions are applied, so ad hoc experiments are invisible."],
    v: "Choose a source table, query the graph for downstream models, then drop a column in a staging copy and confirm exactly those models fail validation.",
    dep: ["metadata-registry", "feature-services"]
  },
  "definition-versioning": {
    s: "Keeps history of every definition change and lets features or services be pinned to a version, so a model can be reproduced and a breaking change can run alongside the old one.",
    d: "Each change to a view, feature or service produces a version, typically linked to a repository commit. Breaking changes, such as new semantics or a new window, are published as a new name or version, and the old one keeps running until its consumers move. Versions multiply storage and compute, since both exist at once, so deprecation must follow. The registry must also record which version produced which stored values.",
    k: ["New version in place versus new feature name: in-place keeps names tidy but risks silent change, new names are explicit and double the cost until the old one is retired.", "Immutable versions versus mutable latest: immutability supports reproduction, but needs retention rules or history grows without bound."],
    p: ["A semantic change is applied as an edit to the same version, and a model trained on the old meaning is silently served the new one.", "Old versions are never retired and storage and compute double again every year."],
    v: "Change a feature's window as a new version, retrain against it, and confirm the old model still receives values from the old version while the new one receives new values at the same time.",
    dep: ["metadata-registry", "feature-definitions"]
  },
  "deprecation-workflow": {
    s: "The process for retiring features safely: announce, track remaining consumers, warn at read time, block new use and finally delete data after a grace period.",
    d: "A deprecation marks a feature or view in the registry with a reason, a replacement and a date. Usage tracking lists remaining consumers, who are notified. Serving can log a warning or add a response header when a deprecated feature is read, and new services can be blocked from adding it. Only after consumers are gone are materialization jobs stopped and data removed. Stopping jobs first is the common failure, because it quietly turns live features stale.",
    k: ["Hard cutoff dates versus waiting for zero consumers: dates force progress, but breaks a model that nobody owned, whereas waiting can keep things alive indefinitely.", "Soft block at definition time versus at read time: definition-time blocks stop growth, but read-time warnings catch consumers that bypass the registry."],
    p: ["Materialization stops on the announced date although one model still reads the feature, so it silently serves stale values.", "A replacement feature has subtly different semantics and consumers swap without retraining."],
    v: "Deprecate a feature with a known consumer and confirm the owner is notified, serving logs a warning on read, and a new service cannot add it.",
    dep: ["usage-tracking", "ownership-and-docs", "metadata-registry"]
  },
  "environment-promotion": {
    s: "Moves definitions from development to staging to production in a controlled way, with separate registries, stores and credentials per environment.",
    d: "Teams develop against small, isolated stores, test in staging with realistic data and apply to production only through the pipeline. Promotion means applying the same definitions with environment-specific configuration, such as source locations and table names, kept outside the definitions. Environments need enough data to be meaningful, but production data brings privacy limits. The main risk is configuration that differs more than intended, so staging passes and production behaves differently.",
    k: ["Separate registries per environment versus one registry with namespaces: separate registries isolate failures, namespaces make promotion and comparison easier but share fate.", "Production data in staging versus synthetic data: real data finds real problems, but needs access controls and masking."],
    p: ["Staging reads a sampled source with no late or duplicate events, so streaming bugs appear only in production.", "An engineer applies to production by switching a flag in their local configuration."],
    v: "Promote one change through all environments and confirm the registry in each shows the same definition hash and that production's source and store settings come from its own configuration only.",
    dep: ["plan-and-apply", "configuration-and-deploy", "metadata-registry"]
  },
  "usage-tracking": {
    s: "Records which models, services and users read each feature, and how often, so the platform knows what is safe to change, what is worth its cost and what can be retired.",
    d: "Usage comes from serving logs, training-set requests and registry bindings. Counting reads per feature and per consumer shows which features are widely reused and which are never read despite costing materialization. It supports cost attribution, deprecation and ranking in search. Counting at the service level hides per-feature use inside a bundle, and training reads are bursty, so both online and offline use should be recorded.",
    k: ["Counting reads versus counting declared bindings: reads show real use but need a logging pipeline, bindings are simple but include models that no longer run.", "Per-request logging versus sampling: full logs are exact but expensive at high request rates, sampling is cheap but misses rare consumers."],
    p: ["A monthly batch model reads a feature once a month, looks unused in a seven-day window and is retired by mistake.", "Usage is recorded by service, not by feature, so one popular feature hides ten unused ones in the same bundle."],
    v: "Make a known number of lookups for one feature from a test client and confirm the usage report shows that count, attributed to that client within the documented delay.",
    dep: ["feature-logging", "metadata-registry"]
  },
});
