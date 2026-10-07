// Details for the progressive-delivery plate, part 3: GitOps, configuration and secrets, database migrations.
ATLAS.details("progressive-delivery", {
  "desired-state-repo": {
    s: "A version-controlled repository holding the declared state of each environment, so that deploying means changing a file and history records every change.",
    d: "The repository contains manifests or templates for each environment: which artifact versions, how many instances, what settings. A release updates the version reference through a commit or merge request, which gets review and runs checks. The repository separates desired state from application source, so deployment changes do not trigger builds. Its history is the audit trail and the rollback source. Structure is hard: one folder per environment, per cluster or per service all have tradeoffs, and generated files can make diffs unreadable.",
    k: ["Separate state repo vs alongside source: separate gives distinct access and history; alongside is simpler and mixes code and release commits.", "Branch per environment vs folder per environment: branches make promotion a merge and cause drift; folders are explicit and need copying.", "Hand-written vs generated manifests: hand-written is readable; generated reduces repetition and hides what will apply."],
    p: ["Image tags are updated by a bot with no review, so any build reaches production.", "Large generated diffs are approved without being read."],
    v: "Commit a version change in the repository for a test environment and confirm the live environment converges to it. Revert the commit and confirm the environment returns to the earlier state, with both changes visible in history.",
    dep: ["release-manifest", "environment-overlays"]
  },
  "reconciler": {
    s: "The control loop that continually compares declared state with live state and applies changes to make them match.",
    d: "On a timer and on repository change, the reconciler fetches desired state, reads actual state from the target, computes the difference and applies it. It is level-triggered: it acts on the current difference, not on a stream of events, so a missed notification does not matter. It reports status per resource and records what it did. Because it runs forever, its failure modes are different from those of a pipeline: a bad commit is applied repeatedly, a conflict with another controller leads to flapping, and an overloaded API server slows every sync.",
    k: ["Continuous reconciliation vs apply-once: continuous corrects drift and fights any manual change; apply-once is predictable and lets divergence persist.", "Poll vs webhook trigger: polling is robust and slow; webhooks are immediate and can be lost, so both are used.", "Reconciler per cluster vs central: per cluster scales and isolates; central gives one place to look and holds credentials for all."],
    p: ["Two controllers manage the same field and overwrite each other in a loop.", "A bad commit is applied to every cluster within minutes, since the reconciler is faster than any human review."],
    v: "Change a resource by hand in a test cluster and confirm the reconciler restores it within the sync interval. Commit a change and confirm it is applied with the sync status showing the new revision.",
    dep: ["desired-state-repo", "drift-detection", "diff-and-plan"]
  },
  "drift-detection": {
    s: "Noticing when the live system differs from what the repository declares, whether caused by manual edits, other controllers or failed applications.",
    d: "The detector compares normalized desired and actual state per resource and classifies each as in sync, out of sync or unknown. Normalization ignores fields that the platform fills in or other controllers legitimately manage, such as defaulted values and autoscaler-set counts. Drift can be reported, alerted on or automatically corrected. It is hard because noise hides real drift: if comparisons list dozens of benign differences, nobody sees the one that matters.",
    k: ["Auto-correct vs alert only: auto-correct keeps the system true to the repository and may undo an emergency manual fix; alert only respects human action and leaves drift in place.", "Ignore rules for controller-managed fields vs strict comparison: ignore rules cut noise and can hide real drift; strict is exact and noisy.", "Check frequently vs rarely: frequent catches drift quickly and loads the API; rare is cheap and slow."],
    p: ["An emergency scale-up by hand is reverted automatically in the middle of an incident.", "Ignore rules are too broad and a security-relevant change is never reported."],
    v: "Edit a resource's image field directly in a test cluster and confirm drift is reported within the check interval, naming the resource and field. Edit an ignored field and confirm no drift is reported.",
    dep: ["reconciler", "diff-and-plan"]
  },
  "diff-and-plan": {
    s: "Computing and showing the exact changes a sync would make before it applies them, so people and checks can inspect what a commit will do.",
    d: "The planner renders the desired manifests, compares them with live state and produces a structured list of creates, updates and deletes, with field-level differences. The result is shown on the change request, so reviewers see the effect on the cluster rather than only the text diff. Policy checks run on the plan. The difficulty is accuracy: the plan is computed at one moment and applied later, and server-side defaults, admission rules and other controllers can make the actual result differ.",
    k: ["Plan from rendered output vs from source diff: rendered shows real effect and takes tooling; source diff is simple and misses template effects.", "Server-side dry run vs client comparison: server-side includes admission and defaulting and needs access; client-side is offline and approximate.", "Plan as a required review step vs optional: required prevents surprises and adds friction."],
    p: ["The plan shows a harmless update while the apply also deletes a resource that was not in the plan's view.", "Plan is computed against a stale snapshot of live state."],
    v: "Open a change request that removes a resource and confirm the plan lists the deletion with the resource name. Merge and confirm the applied result is identical to the plan.",
    dep: ["desired-state-repo", "policy-checks"]
  },
  "sync-policies": {
    s: "Rules governing when and how the reconciler applies changes: automatically or on approval, in what order, with what retries, and during which times.",
    d: "A policy chooses between automatic sync on every commit and manual sync requiring a click. It also sets ordering between resource types such as schema jobs before workloads, retry limits, whether to prune deleted resources, and sync windows. Policies often differ by environment: automatic in test, manual or time-limited in production. They are the point at which a GitOps system meets governance. The difficulty is ordering: resources have dependencies that the declared state does not express.",
    k: ["Automatic sync vs manual in production: automatic is fast and every merged commit is live; manual adds a deliberate human step and a lag.", "Strict ordering by phase vs apply everything together: phases handle dependencies and take longer; together is fast and fails on ordering.", "Retry forever vs stop after limit: retrying heals transient failures and hammers the system; stopping is safe and requires attention."],
    p: ["A workload is applied before the schema job it needs and crash-loops until the job finishes.", "Automatic sync in production applies a merge made for another environment."],
    v: "Merge a change under a manual-sync policy and confirm nothing changes until approved. Under automatic policy, confirm the change applies within the interval and that the schema job ran before the workload.",
    dep: ["reconciler", "approval-gates", "migration-ordering"]
  },
  "pruning": {
    s: "Deleting live resources that are no longer declared in the repository, so removing something from the repository removes it from the environment.",
    d: "The reconciler tracks which resources it created through labels or an inventory. When one disappears from desired state, pruning removes it. Without pruning, deleted declarations leave orphaned objects that keep consuming resources and sometimes serving traffic. It is dangerous because a rendering error or a partially fetched repository can look like everything was deleted. Safeguards include disabling prune on sensitive types, requiring confirmation for large deletions and refusing to prune when the input is empty or has changed implausibly.",
    k: ["Prune automatically vs manually: automatic keeps state exact and one bad commit can delete production; manual is safer and leaves orphans.", "Cascade to dependents vs protect: cascade cleans completely and takes data with it; protection keeps data and leaves residue.", "Prune by ownership labels vs by inventory: labels are simple and can be copied by accident; inventory is exact and needs storage."],
    p: ["A broken template renders nothing and the reconciler prunes the entire application.", "A persistent volume is deleted along with the workload that declared it, destroying data."],
    v: "Remove a resource from the repository in a test environment and confirm it is deleted. Then simulate an empty render and confirm the reconciler refuses to prune and reports the anomaly.",
    dep: ["reconciler", "diff-and-plan"]
  },
  "health-assessment": {
    s: "Evaluating whether the resources the reconciler applied are actually working, not just created, and reporting that status as part of the sync result.",
    d: "After applying, the system checks each resource against type-specific health rules: a workload has the desired number of ready instances, a job completed, a route has endpoints. Status combines into an overall result: progressing, healthy, degraded, missing. Progressive strategies and wave orchestration read this to decide whether to continue. Custom resources need custom rules. The failure mode is declaring success on creation: an object that exists is not an object that works.",
    k: ["Built-in health rules vs custom checks: built-in works for common types; custom covers everything else and must be maintained.", "Wait for health before marking synced vs report immediately: waiting is truthful and slow; immediate is fast and misleading.", "Application-level health vs resource-level: resource-level is generic; application-level reflects real function and needs endpoints to check."],
    p: ["A deployment is marked healthy because the instances are running while they return errors to all requests.", "Unknown resource types are assumed healthy."],
    v: "Apply a manifest referencing an image that cannot be pulled and confirm status goes to degraded with the reason, and that dependent waves do not continue. Fix the reference and confirm status becomes healthy.",
    dep: ["reconciler", "readiness-gates"]
  },
  "pull-based-agents": {
    s: "Reconcilers that run inside each target environment and pull desired state from outside, instead of a central system pushing into it.",
    d: "An agent in the cluster holds read-only credentials for the repository and applies changes locally with the cluster's own permissions. No inbound access or cluster credentials are held outside it, shrinking what an attacker gains from compromising the delivery system. It also keeps working through network partitions, applying the last known state. The tradeoff is visibility and coordination: with agents everywhere, a central view must collect status from each, and waves need a way to signal agents when to proceed.",
    k: ["Pull vs push: pull limits credential exposure and keeps edges autonomous; push is simple to coordinate and holds keys to every target.", "Agent per cluster vs shared agent: per cluster isolates and multiplies upgrades; shared is easy to manage and widens blast radius.", "Agents update themselves vs managed centrally: self-update is autonomous; central keeps versions aligned and is a dependency."],
    p: ["A bad agent version is rolled out to every cluster and stops all further deployments.", "An agent loses repository access and silently stops reconciling while its cluster drifts."],
    v: "Block the agent's access to the repository and confirm it keeps the current state and alerts about staleness. Restore access, commit a change and confirm it applies and central status updates.",
    dep: ["reconciler", "deployment-credentials", "cluster-registry"]
  },
  "config-bundles": {
    s: "A versioned package of settings delivered to services alongside or separately from the code, so configuration changes are releases that can be reviewed and reversed.",
    d: "Settings are grouped by service and environment into a bundle with an identifier and checksum. The bundle can be baked into the artifact, delivered as files on the target, or served by a configuration service. Treating it as a release unit gives it history, review and the same rollout stages as code. Separate delivery allows changes without a build but creates a second thing that can break production. Many outages come from settings changes, so the bundle needs the same rigor as code.",
    k: ["Baked into artifact vs delivered separately: baked ties config to code and requires a build for every change; separate is fast and creates a version-pairing problem.", "One bundle per service vs shared: per service is clear; shared reduces repetition and couples services.", "Push to targets vs pull at startup: push is prompt; pull is simple and applies only on restart."],
    p: ["A config change reaches the entire fleet at once because it bypassed the staged rollout used for code.", "Bundle and code versions drift so the code reads a setting that the deployed bundle lacks."],
    v: "Publish a changed bundle and confirm only the targeted environment receives it, the ledger records the bundle id, and the running service reports the new value. Roll back and confirm the previous value.",
    dep: ["config-versioning", "config-validation"]
  },
  "config-versioning": {
    s: "Recording every configuration change with a version, author and time, and tying each running instance to the exact version it uses.",
    d: "Every change produces a new immutable version, stored in version control or a configuration store. Instances report which version they run, so operators can tell at a glance whether a fleet is consistent. A deployment record lists both the code and config versions deployed together. Diffs between versions show what changed in an incident. It enables rollback to a named earlier version and bisecting a regression to a single change. The weak point is dynamic settings edited in place with no history.",
    k: ["Immutable versions vs edit in place: immutable gives history and rollback; in place is quick and loses the record.", "Single version for all settings vs per key: single is atomic and coarse; per key is flexible and creates untested combinations.", "Store in code repository vs configuration service: repository gets review for free; service allows runtime change and needs its own audit."],
    p: ["A setting edited in a console has no history, so nobody can say what it was before the outage.", "Instances report the version they loaded at startup, not the one currently in effect after a reload."],
    v: "Pick a running instance, read the config version it reports, retrieve that version from the store and confirm every value matches what the instance is using, with an author and time on the change.",
    dep: ["config-bundles", "deployment-ledger"]
  },
  "environment-overlays": {
    s: "Layering environment-specific values on top of a shared base definition, so differences between environments are small, explicit and reviewable.",
    d: "A base holds what is common: structure, defaults, resource shapes. An overlay per environment or region replaces or adds a few values such as replica counts, endpoints and limits. Rendering merges them into the final manifest or settings. This keeps environments similar by construction and makes each difference a visible line. It fails when overlays grow until they override everything, and when merging rules are subtle enough that the rendered result surprises its authors.",
    k: ["Overlays vs templates with parameters: overlays keep the base readable and patch-like; templates are powerful and become programs.", "Many small overlays vs few large: small ones are focused and numerous to follow; large ones are simple and hide differences.", "Allow overlays to change anything vs a fixed set of fields: anything is flexible and erodes parity; a fixed set preserves similarity and blocks legitimate cases."],
    p: ["A production-only overlay changes behavior that staging never exercises.", "Merge rules replace a list instead of appending, silently dropping settings."],
    v: "Render the final configuration for staging and production and diff them. Confirm the differences are exactly the intended overlay values and nothing else.",
    dep: ["config-bundles", "environment-parity"]
  },
  "config-validation": {
    s: "Checking configuration against a schema and rules before it is delivered, so malformed or dangerous values are rejected in the pipeline rather than at runtime.",
    d: "Validation runs at several points: syntax and schema on commit, semantic rules such as ranges and cross-field consistency in the pipeline, and a trial load by the actual service in a test environment. Rules can include safety limits like a maximum change in a numeric value per release. It catches typos, missing keys and impossible combinations. It cannot catch values that are valid and wrong, so it is paired with staged rollout and monitoring of the effect.",
    k: ["Schema validation only vs loading in the real service: schema is quick and misses semantics; real load is accurate and slower.", "Reject on any warning vs only errors: strict is safe and noisy; errors-only is smooth and misses risky values.", "Limit change magnitude vs allow any value: limiting prevents large mistakes and blocks legitimate big changes; allowing is flexible and risky."],
    p: ["A timeout is set to 30 instead of 3 seconds; it is valid, passes the schema, and degrades the service.", "Validation uses an older schema version than the running code, so correct new settings are rejected."],
    v: "Submit a config with a wrong type, a missing required key and an out-of-range value, and confirm each is rejected with a message naming the key. Submit a valid one and confirm acceptance.",
    dep: ["config-bundles"]
  },
  "config-reload": {
    s: "Applying changed configuration to a running process without restarting it, through a signal, a watch on files or a subscription to a configuration service.",
    d: "A running process watches for new configuration, validates it and swaps it in atomically, keeping the previous values if the new ones fail to load. This permits fast changes and avoids a rollout of instances for each setting. It also means the fleet's behavior changes without any deployment record unless reloads are logged and tied to versions. Not every setting can be changed live, such as ones used to size memory at startup. Failed or partial reloads leave instances running differing values.",
    k: ["Live reload vs restart to apply: live is fast and creates behavior changes without a rollout; restart reuses the deployment machinery and is slower.", "Atomic swap of all settings vs per key: atomic is consistent; per key is simple and exposes mixed states.", "Fail to previous values vs fail the process: keeping previous values is resilient and masks problems; failing is loud and takes down capacity."],
    p: ["Half the fleet fails to parse the new file and keeps old values, so behavior depends on which instance answers.", "A reload changes a pool size at runtime and causes a connection storm across all instances at once."],
    v: "Change a live-reloadable setting and confirm every instance reports the new value and config version within the stated time. Push an invalid value and confirm instances keep the old values and raise an alert.",
    dep: ["config-versioning", "config-validation"]
  },
  "secret-references": {
    s: "Naming a secret in configuration by a pointer to the secret store rather than containing its value, so repositories and pipelines never hold the secret itself.",
    d: "Configuration says which secret and version to use, for example a path and a label. The value is resolved at deployment or startup by something with permission to read it. This keeps secrets out of repositories, logs, artifacts and ledgers, and allows rotation by changing the stored value or the version pointer. The reference is checked in the pipeline: it must exist and the target must be allowed to read it. The danger is value leakage in places references do not protect, such as rendered manifests and debug output.",
    k: ["Reference to store vs encrypted value in repository: references keep values out entirely and require a live store; encrypted-in-repo is self-contained and puts ciphertext in history forever.", "Pin to a secret version vs latest: pinned is reproducible and needs a change to rotate; latest rotates automatically and can break callers.", "Resolve in the pipeline vs on the target: on the target limits exposure; in the pipeline lets it check and puts values in reach of the pipeline."],
    p: ["The pipeline resolves the reference and prints the rendered manifest in its log, exposing the value.", "A reference points to a secret the target cannot read, and the failure appears only at startup."],
    v: "Search the repository, artifact, ledger and pipeline logs for the secret's value and confirm none contain it. Deploy with a reference to a missing secret and confirm the pipeline fails before changing anything.",
    dep: ["identity-and-trust"]
  },
  "secret-injection": {
    s: "The mechanism that places a secret's value into a running process at the last moment, through an environment variable, mounted file or runtime fetch.",
    d: "At start or at request time, an agent or the platform authenticates the workload using its identity, fetches the permitted secrets, and delivers them in memory or a restricted file. The deployment system never sees the values; it only grants the workload permission to read them. Delivery as files allows updating without restart; environment variables are universal and visible to child processes and crash dumps. It is hard to avoid leaving values in logs, dumps, shell history or images.",
    k: ["Files vs environment variables: files can be rotated live and need file permissions; environment variables are simple and leak into dumps and children.", "Fetch at startup vs on each use: startup is fast and holds old values; per use rotates immediately and depends on the store being available.", "Sidecar agent vs library in the application: agent needs no code changes and adds a process; library is lean and every application must adopt it."],
    p: ["A crash dump or error report includes the environment, writing secrets into the error tracker.", "The secret store is down at startup and instances refuse to start during an outage."],
    v: "Start a workload with a permitted secret, confirm it can read it, then start one without permission and confirm denial. Inspect image layers, logs and crash output for the value and confirm it is absent.",
    dep: ["secret-references", "deployment-credentials", "identity-and-trust"]
  },
  "secret-rotation": {
    s: "Replacing credentials on a schedule or after exposure, in a way that running systems pick up the new value without outage.",
    d: "Rotation creates a new credential, makes both old and new valid for an overlap, lets consumers pick up the new one, then revokes the old. It must be coordinated with deployments: a release in progress may hold the old value, and a rollback may restore a version that expects it. Automated rotation reduces long-lived exposure and the cost of a leak. It breaks easily when some consumer is unknown and still uses the old credential after revocation.",
    k: ["Short-lived credentials vs rotated long-lived ones: short-lived limit exposure and need constant issuance; rotated ones are simple and have long exposure between changes.", "Overlap period long vs short: long is safe for slow consumers and leaves two valid credentials; short is tight and risks outages.", "Automatic vs manual rotation: automatic happens reliably and can break unnoticed; manual is deliberate and gets forgotten."],
    p: ["The old credential is revoked while a rolled-back release still uses it, and the rollback fails.", "Unknown consumer, discovered only when its calls begin failing after revocation."],
    v: "Rotate a credential in a test environment while generating traffic and confirm no request fails during the overlap and after the old one is revoked, and that access logs show no use of the revoked credential.",
    dep: ["secret-injection", "secret-references"]
  },
  "migration-scripts": {
    s: "Versioned, ordered scripts that change the database schema or data, stored with the code and applied exactly once per database.",
    d: "Each migration has an identifier and the change to apply, often with a counterpart to reverse it. They are reviewed and shipped with the release that needs them. The runner records applied ones in a table in the database, so each runs once per database. Scripts must be written with production in mind: operations that lock a large table for minutes, rewrite every row, or fail halfway are common causes of outages. Review focuses on locking behavior and on compatibility with the code currently running.",
    k: ["Forward-only vs reversible scripts: forward-only is honest, since many changes cannot be reversed; reversible gives a rollback path that is rarely tested.", "Schema-only vs schema with data changes: separating keeps locks short and splits the work into more steps; combining is simple and slow and risky.", "Raw statements vs declarative schema diff: raw is exact and manual; declarative is convenient and may choose a dangerous way to reach the target."],
    p: ["A script adds a column with a default to a huge table and locks it for ten minutes.", "Two developers create migrations with the same number on different branches and one is skipped."],
    v: "Run the migration against a copy of production-sized data and measure locks held and duration. Confirm the applied-migrations table lists it once and that running the runner again does nothing.",
    dep: ["migration-runner", "schema-compatibility-checks"]
  },
  "expand-contract": {
    s: "A pattern that makes schema changes safe across versions by first adding the new structure, then moving code and data over, and only later removing the old structure.",
    d: "Expand adds the new column or table while keeping the old one, so both code versions work. Migrate switches the code to write both, backfills old data, then reads the new structure. Contract removes the old structure in a later release when nothing uses it. Each step is a separate deployment that is safe on its own and reversible until the contract. It trades speed and simplicity for safety: one logical change becomes three or four releases that are easy to forget to finish.",
    k: ["Expand-contract vs a single coordinated migration: expand-contract is safe with rolling deploys and slow; single is quick and demands downtime or perfect timing.", "Dual write vs trigger-based sync: dual write is explicit in code; triggers need no code changes and hide behavior in the database.", "Contract immediately vs after a soak period: immediate reclaims space and removes the rollback; delayed keeps safety and clutter."],
    p: ["The contract step is never done, and the schema collects dead columns that nobody dares remove.", "Dual write is deployed before the column exists on all replicas, causing write errors."],
    v: "Run the three phases with old and new code instances live at each step, and confirm that at every step both versions read and write correctly and no request fails.",
    dep: ["migration-scripts", "backfill-jobs", "version-coexistence"]
  },
  "migration-runner": {
    s: "The component that applies pending migrations to a database during a release, tracking which have run and reporting success or failure.",
    d: "It connects with elevated credentials, finds migrations not yet recorded, runs them in order within transactions where supported, and records each success. It runs as a distinct pipeline step before or after the application rollout, or as a job in the target environment. Running migrations at application startup is common in small systems and dangerous at scale because many instances race to run them. It is hard to make safe when a migration fails halfway through and leaves the schema in a state neither version expects.",
    k: ["Run as separate step vs at application startup: separate is controlled and observable; startup is automatic and races across instances.", "Transactional DDL vs not: transactions give all-or-nothing and are unavailable for some operations; non-transactional needs manual cleanup after failure.", "Elevated credentials only for the runner vs application: separate credentials limit what the application can do; one credential is simpler and riskier."],
    p: ["Ten instances start together and all try to run the same migration.", "The runner crashes after applying a change but before recording it, and the next run fails because the change already exists."],
    v: "Run the runner twice against a test database and confirm the second does nothing. Kill it during a migration and confirm the database is either unchanged or recorded as failed with clear state to repair.",
    dep: ["migration-ordering", "migration-locking", "deployment-credentials"]
  },
  "migration-ordering": {
    s: "Deciding when migrations run relative to the code rollout, and in what order across services that share a database.",
    d: "Additive changes run before the new code so it finds what it needs; destructive changes run after the old code is gone. Pipelines encode this as phases: pre-deploy migrations, rollout, post-deploy cleanups. Where several services share a database or one service depends on another's schema, ordering must also span services. The rule is that at every moment, every running code version must work with the current schema. This constraint is easy to state and difficult to verify.",
    k: ["Migrate before deploy vs after: before suits additive changes and breaks old code if destructive; after suits removals and fails new code that needs the change.", "Ordering by convention vs enforced by pipeline: convention is flexible and forgotten; enforced is reliable and rigid.", "Per-service databases vs shared: per-service limits ordering concerns; shared couples release schedules."],
    p: ["A column rename runs before deploy and breaks every old instance still serving.", "Another team's service reads the table being changed and nobody told them."],
    v: "For a given release, list the migrations and mark which phase each ran in, then check each phase against code versions live at that moment, confirming no version relied on a missing or removed structure.",
    dep: ["migration-scripts", "schema-compatibility-checks"]
  },
  "migration-locking": {
    s: "Preventing concurrent migration runs and keeping each migration from holding database locks long enough to stall production queries.",
    d: "A mutual-exclusion lock on the database ensures only one runner works at a time. Within a migration, techniques limit blocking: short lock timeouts that fail rather than wait, building indexes without blocking writes, adding constraints in an unvalidated state and validating later, and splitting big updates into batches. Lock waits are the typical failure: a migration waits for a long query, and every new query waits behind the migration, producing an outage from a quiet operation.",
    k: ["Lock timeout that fails fast vs wait: failing fast protects traffic and needs retries; waiting finishes and can queue all traffic behind it.", "Online schema-change tools vs plain statements: online tools avoid long locks and use extra space and complexity; plain statements are simple and block.", "Run in low-traffic hours vs any time: low-traffic lessens impact and reintroduces change windows; any time fits continuous delivery and needs safe techniques."],
    p: ["A migration waits behind a long report query, and all application queries queue behind it until the pool is exhausted.", "Two runners start at once because the lock is per session and the session dropped."],
    v: "Run the migration on a loaded test database while measuring application query latency. Confirm maximum added latency stays under the budget and that a second concurrent runner is refused.",
    dep: ["migration-runner", "migration-scripts"]
  },
  "backfill-jobs": {
    s: "Background jobs that fill or convert existing rows for a new structure, running in small batches so they do not harm live traffic.",
    d: "After the new column or table exists and new writes populate it, old rows need converting. A backfill reads rows in ranges, writes in modest batches with pauses, tracks progress durably so it can resume, and throttles itself by watching load and replication lag. It runs separately from the deployment because it may take hours or days. Correctness is subtle: rows change while it runs, so it must cooperate with dual writes and avoid overwriting newer data with older.",
    k: ["Batch size small vs large: small is gentle and slow; large is fast and builds lag and locks.", "Throttle by fixed rate vs by observed load: fixed is simple; observed adapts and relies on good signals.", "In database vs by application code: in database is quick for simple changes; application code can reuse business logic and is slower."],
    p: ["The backfill overwrites a row that live traffic updated moments earlier, with stale data.", "It saturates replication and read replicas fall minutes behind."],
    v: "Run the backfill on production-like data while the application serves traffic. Confirm replication lag and query latency stay inside limits, the job resumes after a kill, and a final count shows no unconverted rows.",
    dep: ["expand-contract", "migration-runner"]
  },
  "schema-compatibility-checks": {
    s: "Automated checks that a proposed schema change works with the code versions that will be running before and after it, catching breaking changes before release.",
    d: "Checks include static rules that flag dangerous operations such as dropping a column still referenced, renaming, or adding a non-null column without default; and dynamic tests that run old code against the new schema and new code against the old. They gate the pipeline before any migration reaches production. They enforce the rule that a release must tolerate both states. They cannot know every consumer, so unknown readers such as reports and other teams' jobs remain a risk.",
    k: ["Static analysis of migrations vs test with real code versions: static is quick and approximate; real-version tests are accurate and need infrastructure.", "Block on any breaking change vs allow with justification: blocking is safe and obstructs legitimate cleanups; justification is flexible and can be abused.", "Check only own service vs all known consumers: own is easy; all consumers is complete and requires a registry of readers."],
    p: ["A check passes against the application's code but a nightly report reads the dropped column.", "Tests run old code on an empty schema, so data-dependent breakage is never seen."],
    v: "Propose a migration that drops a used column and confirm the check fails with the column and referencing code. Propose an additive change and confirm both old-code and new-code test suites pass against it.",
    dep: ["migration-scripts", "version-coexistence"]
  },
  "migration-rollback-plans": {
    s: "A written and tested plan for what to do if a migration or its release goes wrong, including when rollback is impossible and what to do instead.",
    d: "For each migration the plan states whether it is reversible, how, and how long it takes; for irreversible changes it says so and names the forward fix route and a backup or snapshot point. Reverse scripts are tested on realistic data. Plans cover partial application and the state of data written by the new version. Dropping columns or converting data in place are common irreversible steps and are why the expand-contract approach keeps old structures until the end.",
    k: ["Reverse script per migration vs restore from backup: reverse scripts are fast for simple changes and often untested; restore is universal and loses recent writes.", "Snapshot before each risky migration vs rely on routine backups: snapshots give a precise point and cost time and storage; routine backups are free and coarse.", "Plan required for every migration vs only risky ones: all are consistent and burdensome; risky-only is efficient and relies on classification."],
    p: ["The reverse script was never run and fails because it assumed an empty table.", "Restoring a backup discards hours of customer writes made after the migration."],
    v: "Rehearse the plan on a production-sized copy: apply the migration, write new data, execute the rollback, and confirm the old code works and data written during the window is preserved or its loss is as documented.",
    dep: ["migration-scripts", "expand-contract"]
  },
});
