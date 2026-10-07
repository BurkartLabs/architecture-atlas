// Details for the experiment tracker plate, part 6: access, tenancy, operations, and cross-cutting concerns.
ATLAS.details("experiment-tracker", {
  "authentication": {
    s: "Establishing who or what is calling: people through single sign-on in the interface, and jobs and services through tokens that are issued, scoped and revoked.",
    d: "People sign in through the organization's identity provider and get a session. Training jobs, pipelines and serving systems authenticate with long-lived keys or short-lived tokens exchanged for workload identity. Tokens carry the principal and scopes, such as write metrics only. Keys are stored by clients in environment variables or credential files, which is where they leak. Jobs outlive sessions, so token expiry and renewal during a week-long run need explicit design.",
    k: ["Long-lived API keys versus short-lived tokens from workload identity: keys are simple to configure and leak and rarely rotate; short-lived tokens limit exposure and need integration with the platform.", "One identity for both people and jobs versus separate service identities: one identity is simple and obscures who a job acts for; service identities give clear attribution and more to manage."],
    p: ["A key is committed with training code and gives write access to every project.", "A token expires mid-run and the client silently stops logging."],
    v: "Issue a scoped token for metric writes only, then use it to log metrics, which succeeds, and to move an alias, which is refused. Revoke it and confirm the next call fails within the documented time.",
    dep: ["workspaces"]
  },
  "authorization-and-roles": {
    s: "The rules deciding what each principal may do to which resources: view, log, edit, approve, promote or administer, per workspace, project and model.",
    d: "Roles bundle permissions and are granted at workspace, project or registered model level, inheriting downward. Registry roles are separate from tracking roles, so a person who can log runs cannot promote a model. Every API call and every search result is checked. Rules also cover cross-cutting acts such as export and deletion. The complexity is inheritance and exceptions, plus the cost of checking permissions on large lists, which pushes checks into queries and caches.",
    k: ["Role-based grants versus per-resource access lists: roles are easy to audit and coarse; resource lists are precise and grow unmanageable.", "Check on every request versus cache decisions: per-request checks reflect revocations immediately and cost latency; cached decisions are fast and stay wrong until expiry."],
    p: ["A user with project read access can fetch artifact links that bypass the project check.", "The approver role is granted to the whole team and everyone can approve their own releases."],
    v: "As a user with only logging rights, try to promote a version, read another project's runs and delete a model. All three are denied and recorded. Granting the approver role changes the first result and nothing else.",
    dep: ["authentication", "workspaces", "access-audit-log"]
  },
  "workspaces": {
    s: "The tenant boundary that separates teams, business units or customers, each with its own projects, models, quotas and administrators within one deployment.",
    d: "Everything is scoped to a workspace: records, artifact prefixes or buckets, registry namespaces and users. Cross-workspace actions, such as copying a model, are explicit and logged. Isolation can be logical, with shared infrastructure and tenant keys on every row, or physical, with separate databases and buckets. Sensitive teams ask for the second. The hard part is guaranteeing that every query path, including search, export and cache, applies the tenant filter.",
    k: ["Logical isolation with shared infrastructure versus separate deployments: logical isolation is efficient and a missed filter leaks data; separate deployments are strongly isolated and costly to operate.", "Global user identity versus per-workspace users: global identity gives single sign-on and complicates guest access; per-workspace users are isolated and duplicated."],
    p: ["A new endpoint forgets the tenant filter and returns another team's runs.", "A cache key omits the workspace and serves one tenant's chart to another."],
    v: "Create identical project names in two workspaces and query every API, including search, export and cache-backed endpoints, as a user from one. No result from the other workspace ever appears.",
    dep: ["metadata-database", "object-store"]
  },
  "quotas-and-cost": {
    s: "Limits and accounting for storage, ingestion volume and compute-related use per team, with reports that attribute cost to the people who cause it.",
    d: "Counters track bytes stored, points written, artifact transfers and active runs per workspace and project. Soft limits warn owners and hard limits block new writes. Usage reports break cost down by project, user and artifact type, usually showing that a few large checkpoints dominate. Cost data also drives cleanup and tiering. Enforcement must be gentle for runs already in progress, since refusing to log in the last hour of a long job wastes the compute already spent.",
    k: ["Hard limits versus soft limits with alerts: hard limits cap spending and can break running jobs; soft limits keep work going and rely on people reacting.", "Charge by stored bytes versus by logical artifact size: stored bytes reflect real cost and reward deduplication; logical size is easy to explain and overcharges shared files."],
    p: ["A project reaches its quota near the end of a week-long run and the final checkpoint cannot upload.", "Usage counters lag and the actual cost exceeds the limit before enforcement triggers."],
    v: "Set a small storage quota and upload past it. The warning fires at the soft threshold, further uploads are refused at the hard one with a clear message, and the usage report matches the object store's byte count within a tolerance.",
    dep: ["object-store", "metadata-database", "workspaces"]
  },
  "retention-policies": {
    s: "Rules for how long each kind of record and file is kept before deletion, with exceptions for holds, registered models and legal requirements.",
    d: "Policies vary by data class: scratch runs may be deleted after weeks, runs behind a deployed model kept for years, and personal data removed on request. The retention job evaluates rules, respects holds and reachability from the registry, and removes records, files and index entries together, then records the deletion. Deletion propagates to backups and caches within a stated time. Conflicts arise between the wish to keep everything for reproducibility and obligations to delete.",
    k: ["Time-based deletion versus deletion tied to usage: time-based is predictable and removes things still referenced; usage-tied is safe and keeps data nobody will ever need.", "Hard delete versus tombstone with later purge: hard delete is final and cannot undo an error; tombstones give a recovery window and delay actual removal."],
    p: ["A run is deleted by policy while a registered model still links to it, leaving an unexplainable version.", "Deletion removes the database record but not the object, and data the policy promised to remove persists."],
    v: "Apply a short policy to test runs, one under legal hold and one backing a registered version. Unprotected runs vanish from records, files, search and caches; the held and referenced ones remain, and the deletion log lists each removal.",
    dep: ["metadata-database", "object-store", "version-to-run-link", "access-audit-log"]
  },
  "access-audit-log": {
    s: "A tamper-evident record of who read, changed, exported or deleted what, and when, kept separately from the application data it describes.",
    d: "Security-relevant calls produce entries with principal, action, resource, result and source address. The log is appended outside the main database, ideally to storage that the application cannot modify, and retained longer than the data it covers. It answers who downloaded a model, who changed a permission and who ran a bulk export. Volume is high if every read is logged, so reads may be sampled or logged only for sensitive classes. Tampering must be detectable.",
    k: ["Log every read versus only writes and sensitive reads: complete logging answers any question and is large and costly; selective logging is manageable and may miss the one read that matters.", "Hash-chained entries versus rely on storage permissions: chaining detects tampering by anyone, permissions are simpler and trust administrators."],
    p: ["Service accounts perform actions on behalf of users and the log shows only the service.", "Logs share a database with application data and are deleted along with it by retention."],
    v: "Download an artifact, change a role and export runs as three different users. Each action appears with the correct principal and resource, and altering an old entry breaks the chain verification.",
    dep: ["authentication", "object-store"]
  },
  "secret-redaction": {
    s: "Detecting and masking credentials, tokens and personal data in logged parameters, environment variables, command lines and console output before they are stored.",
    d: "The client filters known sensitive names, such as keys containing token or password, and scans values and log lines for patterns like private keys and access tokens. The server applies a second pass on arrival, since clients cannot be trusted to be current. Matches are replaced with a placeholder and counted. Detection is heuristic, so it reduces risk and cannot eliminate it; the stronger measure is keeping secrets out of the places that get logged.",
    k: ["Redact on the client versus on the server: client redaction keeps secrets from ever leaving the machine and depends on library versions; server redaction is uniform and sees them in transit.", "Pattern-based detection versus an explicit deny-list of names: patterns catch the unexpected and produce false positives; deny-lists are precise and miss new names."],
    p: ["A secret passed in a command-line argument is logged in the run's command field.", "Over-eager masking hides a legitimate parameter such as a token limit and confuses comparison."],
    v: "Launch a run with a fake access token in an environment variable, a command-line flag and a printed log line. None appear in stored records, and the run shows a count of redacted values.",
    dep: ["environment-capture", "client-sdks", "batch-ingest"]
  },
  "deployment-topology": {
    s: "How the tracker itself is run: managed service or self-hosted, the number of servers, how stateless parts and stores are arranged, and how it spans regions.",
    d: "The server tier is stateless and scaled behind a load balancer; the queue, database, metric store and object store hold state. Small teams run a single process with local files, while large ones run many replicas with managed stores. Region placement matters: trainers should write to a nearby endpoint, and artifacts should live near compute to avoid transfer cost. Air-gapped sites run the full stack on premises. Upgrades follow the compatibility rules for clients.",
    k: ["Single region with all data versus regional endpoints with replication: single region is simple and slow and costly for distant clusters; regional endpoints are fast and replicating metadata is complicated.", "Managed service versus self-hosted: managed removes operation and moves data outside the organization; self-hosted keeps control and requires on-call expertise."],
    p: ["A local-file deployment is promoted to team use and loses data when the machine is replaced.", "The server sits in one region while clusters are in another, and upload costs and failures dominate."],
    v: "Deploy the stack in the target topology and run a full workflow: log runs from remote clusters, register and promote a model. Kill one server replica during logging and confirm no data is lost and clients reconnect.",
    dep: ["metadata-database", "metric-store", "object-store", "ingest-queue"]
  },
  "self-monitoring": {
    s: "Metrics, logs and alerts about the tracker's own health: ingestion lag, error rates, query latency, storage growth and the freshness of derived data.",
    d: "The system exports request rates and latencies per endpoint, queue lag, consumer errors, database load, cache hit rates and bytes per workspace. Alerts fire on lag beyond a threshold, rising error rates and storage growth. A synthetic client logs a run continuously and checks that its data appears within a target delay, which proves the whole path works. Because the tracker is critical for ongoing training, it also needs its own operations runbooks.",
    k: ["Synthetic end-to-end probe versus internal metrics only: a probe tests the real path and shows what users experience; internal metrics are detailed and can all look healthy while data is lost.", "Alert on symptoms versus causes: symptom alerts match user impact and need diagnosis; cause alerts are specific and noisy."],
    p: ["Ingestion lag grows slowly for days and no alert fires because the threshold was set for a smaller system.", "Metrics report the server healthy while a consumer has silently stopped writing to the store."],
    v: "Pause the queue consumer in a test environment. Within the alert window, the lag alert fires and the synthetic run reports missing points, and both clear after the consumer resumes and the backlog drains.",
    dep: ["ingest-queue", "metric-store", "metadata-database"]
  },
  "immutability-and-identity": {
    s: "The decision about what can never change and how every record is named: runs, versions and artifacts are fixed once finished, and every reference uses stable identifiers.",
    d: "Trust in a tracker depends on records that mean the same thing tomorrow. Finished runs, model versions and artifact content are written once; corrections are new records that point to the old. Identifiers are assigned once and never reused, including after deletion. Names for humans are separate from identity. This choice shapes the object store, the registry, lineage and audit. Where mutability is needed, such as tags or aliases, it is isolated into explicit, logged fields.",
    k: ["Immutable records with correction by addition versus editable records with history: immutability is simple to reason about and creates clutter; editing is tidy and every consumer must handle changing meaning.", "Never reuse identifiers versus recycle: never reusing keeps old links truthful and grows identifier space; recycling is compact and lets a link silently point to something else."],
    p: ["A deleted model name is reused by another team and old deployment records now appear to refer to the new model.", "A metric corrected in place changes a past evaluation that a deployment decision relied on."],
    v: "Attempt to modify a finished run's parameters, overwrite a version's file and reuse a deleted identifier. Each is refused, and the only permitted changes are in explicitly mutable fields with history.",
    dep: ["run-identity", "model-versions", "content-addressing", "promotion-history"]
  },
  "schema-evolution": {
    s: "The decision about how the shape of records and the meaning of metrics change over the years while old runs remain readable and comparable.",
    d: "Parameters and metric names are free-form, libraries change what they log, and the database schema itself evolves. The system must read a run from three years ago beside one from today. Strategies include versioned record formats, naming conventions, aliases between old and new metric names, and migrations that never rewrite history. Without them, comparisons across time quietly compare different things, since a metric named accuracy may be computed differently after a code change.",
    k: ["Store raw as logged plus mapping layers versus rewrite old data to the new schema: mappings preserve the original and add translation logic; rewriting is clean and destroys the record of what was logged.", "Strict naming conventions versus free-form names: conventions enable comparison and need enforcement; free-form is easy and diverges."],
    p: ["A metric definition changes in the code with the same name and an old and a new run are compared as equals.", "A format change in a stored record breaks reading of every run before the change."],
    v: "Load runs recorded under three successive record formats and metric definitions. All open and chart correctly, and the comparison view flags the runs whose metric definition version differs.",
    dep: ["schema-migrations", "api-versioning", "metric-logging", "parameter-logging"]
  },
  "logging-scale": {
    s: "The decision about how much can be logged and kept: points per second, series per run, runs per day, and who pays for them.",
    d: "A single run can write thousands of values per second across hundreds of series, and a platform runs thousands of jobs. Volume decides batching in clients, queue sizing, store design, downsampling and retention. Conventions such as logging intervals and series naming limits have to be set before the numbers grow, because every layer, from the interface to storage, was designed for an assumed range. Costs scale with cardinality and retention, not just rate.",
    k: ["Enforce logging budgets in the client versus accept anything and scale the servers: client budgets protect cost and may drop data users wanted; scaling servers is accommodating and the bill grows without limit.", "Keep full resolution forever versus downsample over time: full resolution supports any later question and is costly; downsampling is cheap and loses fine detail permanently."],
    p: ["One experiment with per-step histograms on a large model increases storage tenfold in a week.", "The interface was tested with hundreds of runs and fails at hundreds of thousands."],
    v: "Load test with the target rate of runs, series and points per second for a day. Ingestion lag stays within target, storage growth matches the model, and chart and table latency stays within bounds at the end.",
    dep: ["batch-ingest", "ingest-queue", "metric-store", "metric-downsampling", "quotas-and-cost"]
  },
  "privacy-and-data-governance": {
    s: "The decision about what data may enter the tracker and who may see it: personal data in tables, sensitive datasets, model memorization, regional rules and rights of deletion.",
    d: "Trackers collect prediction samples, input examples, text and images that can contain personal information, and models themselves can encode training data. Policy decides what may be logged, which workspaces may hold regulated data, where it is stored geographically, and how deletion requests propagate to runs, artifacts, caches and backups. These constraints cross all layers: logging libraries, storage placement, search, exports and retention all need to honor them, and they conflict with reproducibility's wish to keep everything.",
    k: ["Ban raw samples from logs versus allow with controls: a ban is simple and weakens debugging; controlled logging is useful and needs classification, access limits and deletion paths.", "Region-pinned storage versus a single global store: pinning meets residency rules and fragments comparison across regions; global storage is simple and may be unlawful for some data."],
    p: ["A deletion request is handled in the database but copies in caches, exports and backups remain.", "Debug tables with real customer records are logged to a widely shared project."],
    v: "Submit a deletion request for a subject whose data appeared in a logged table. After the stated period, searches, artifacts, caches and exports contain no trace, and the audit log shows the request and each purge step.",
    dep: ["retention-policies", "workspaces", "authorization-and-roles", "media-and-table-logging"]
  },
  "failure-tolerance": {
    s: "The decision about what happens when the tracker or the network is unavailable: training continues, records are buffered, and the system degrades without losing data silently.",
    d: "Trainers cost far more than the tracker, so the tracker must never be the reason a job dies. Clients buffer, retry and fall back to local files; servers acknowledge only after durable intake; queues absorb bursts; consumers are idempotent. Registry reads used by serving need a different standard, since they sit on the path to production and must have cached fallbacks. Explicit rules are needed for what gets dropped under overload, and users must be told when it happens.",
    k: ["Fail open for logging versus fail closed: failing open keeps training going and may produce runs with holes; failing closed gives complete records and wastes compute when the tracker is down.", "Serving falls back to the last known version versus refuses to start: fallback keeps service up and may run an outdated or revoked model; refusing is strict and takes the service down."],
    p: ["A tracker outage during a long job silently drops values, and nobody can tell which runs are incomplete.", "A serving system that cannot reach the registry at restart starts with an unvalidated default."],
    v: "Cut the tracker's network for the middle third of a training job and for a serving restart. The job completes at normal speed with all points recovered later, runs are marked as having had an outage, and serving starts from its cached version.",
    dep: ["client-buffering", "offline-sync", "ingest-queue", "registry-api"]
  },
  "trust-in-recorded-claims": {
    s: "The decision about how far to believe what the record says: who wrote each value, whether it was independently measured, and how tampering or error is detected.",
    d: "Most of a run's record is written by the code under test: its metrics, its claimed data version and its claimed seed. An author can log any number. For promotion and audits, claims need different standing: values computed by independent evaluation jobs, hashes verified against stored bytes, and approvals signed by identities. The system distinguishes self-reported from verified fields and gives gates only the second kind. Without this, governance verifies the story the author told, not the model.",
    k: ["Treat all logged values as equal versus tag provenance of each: equal treatment is simple and lets a self-reported score pass a gate; provenance tags make gates meaningful and need an independent evaluation path.", "Sign records and artifacts versus rely on access control: signing proves origin and integrity even to administrators and needs key management; access control is easier and trusts the operator."],
    p: ["A gate reads accuracy from the training run, which the author can set to any number.", "An artifact is replaced in storage by someone with bucket access and no hash is checked at deployment."],
    v: "Try to pass a promotion gate with a hand-logged metric on a run. The gate rejects it as self-reported, and passes the same version once an independent evaluation job writes the verified metric.",
    dep: ["evaluation-reports", "promotion-gates", "content-addressing", "approval-workflows"]
  },
});
