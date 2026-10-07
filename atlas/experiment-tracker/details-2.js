// Details for the experiment tracker plate, part 2: governance, documentation, registry.
ATLAS.details("experiment-tracker", {
  "stages-and-aliases": {
    s: "Named labels on model versions, such as staging or production, that tell consumers which version to use without hard-coding a version number.",
    d: "Early registries used a fixed set of stages with one version per stage. Newer designs use free-form aliases, where a name points to exactly one version of a model and can be moved. Consumers ask for the model by name and alias. Moving an alias is the act of promotion, and it must be atomic, so no reader sees two versions or none. The hard part is meaning: a label only helps if every team agrees what it promises about testing and readiness.",
    k: ["Fixed stages versus free-form aliases: fixed stages give one shared vocabulary, and aliases fit blue-green releases and per-region variants at the cost of conventions each team must invent.", "One alias per version versus many: one alias per model-version pair makes lookup unambiguous, while allowing several lets a version be both candidate and canary and makes questions about current state harder."],
    p: ["Two people move the production alias at the same time and the later write silently wins.", "A stage named production is used before any checks have run, and teams stop trusting the label."],
    v: "Point an alias at version 7 while a reader resolves it in a loop. Every resolution returns either the old or the new version, never an error or empty value, and the history shows who moved it and when.",
    dep: ["model-versions", "promotion-history"]
  },
  "promotion-gates": {
    s: "Conditions that must hold before a version may move to the next stage: required metrics, completed checks, documentation present and approvals given.",
    d: "A gate is a rule evaluated when someone requests a stage change or alias move. It reads data already in the system: evaluation metrics against thresholds, validation results, presence of a model card, a lineage that includes an approved dataset. Failed gates block the move and list the reasons. Some gates are automatic and some wait for a person. The design question is whether rules are code in a pipeline or configuration in the registry, since rules that cannot be inspected get bypassed.",
    k: ["Gates enforced by the registry versus by the deployment pipeline: registry enforcement blocks every path in one place, pipeline enforcement is flexible and can be bypassed by a direct alias move.", "Hard thresholds versus statistical comparison to the incumbent: fixed thresholds are easy to explain, and comparison to the current model adapts as quality improves and needs enough data to be trustworthy."],
    p: ["Gates read metrics from the training run, which the author can edit, instead of from an independent evaluation.", "A threshold set once is never revisited and slowly stops meaning anything."],
    v: "Try to promote a version with a failed validation check and with a missing model card. Both attempts are rejected with a reason per failed gate, and the same version passes once both conditions are fixed.",
    dep: ["validation-checks", "model-cards", "stages-and-aliases", "evaluation-reports"]
  },
  "approval-workflows": {
    s: "Requests for sign-off on a version or stage change, routed to named reviewers, with the decision, comments and identity recorded against the version.",
    d: "A requester opens a request naming the target stage. The workflow notifies reviewers according to roles, such as a risk owner or a product owner, and tracks each response. Rules decide how many approvals are needed and whether the requester may approve their own request. When complete, the system performs the change itself, so approval and action cannot diverge. The hard part is the human side: slow review blocks releases, and fast review turns into rubber stamping.",
    k: ["Multiple required approvers versus one: several approvers add real independence and delay releases; one is quick and leans on trust.", "Approval bound to a specific version hash versus to a name: binding to the hash means a changed artifact needs fresh approval, binding to the name is looser and approves something that was later replaced."],
    p: ["Reviewers approve from a summary of the model while the underlying files changed after the request opened.", "The requester holds the reviewer role as well, and the separation of duties exists only on paper."],
    v: "Open a request for a version, approve as the requester and confirm it is refused, approve as two distinct reviewers and confirm the alias moves automatically and each approval is recorded with identity and time.",
    dep: ["promotion-gates", "authorization-and-roles", "promotion-history", "notifications-and-alerts"]
  },
  "validation-checks": {
    s: "Automated tests run on a candidate version before promotion: loading it, checking its input schema, scoring a held-out set and comparing behavior to the current model.",
    d: "A validation job pulls the packaged version, loads it in a clean environment, sends sample inputs through it and checks outputs against the signature. It runs evaluation on data the training run never saw and attaches the results to the version. Further checks cover latency, memory, slice-level metrics and robustness to malformed inputs. The registry stores results as structured records that gates can read. Hard parts are keeping the validation data truly separate and keeping the environment the same as production.",
    k: ["Run validation inside the registry versus in an external pipeline that reports back: built-in runs are uniform and need the registry to host compute; external runs reuse existing infrastructure and need trust in the reporter.", "Aggregate metrics versus slice-level metrics: aggregate numbers are simple, slices catch regressions on small groups that averages hide."],
    p: ["The held-out set leaks into training through a shared dataset update and validation scores look perfect.", "Validation passes in a developer's environment and the model fails to load in the serving image."],
    v: "Submit a version whose model file is corrupted and one whose output shape violates its signature. Both fail validation with distinct messages, and a healthy version records scores plus latency percentiles against it.",
    dep: ["model-versions", "model-signature", "model-packaging", "data-snapshot-pinning"]
  },
  "champion-challenger": {
    s: "Keeping the current production version as champion and testing a new candidate against it on live or replayed traffic before it replaces the champion.",
    d: "The registry marks one version as champion and others as challengers for the same model. Challengers can run in shadow, receiving a copy of traffic whose answers are logged but not used, or take a small share of real traffic. Results from both are compared on agreed metrics, and a rule or person decides whether the challenger becomes champion. The tracker records the comparison. The difficulty is statistical: small traffic shares and delayed outcomes mean decisions are made on weak evidence.",
    k: ["Shadow traffic versus split traffic: shadow carries no user risk and cannot show how users react; splits measure real impact and expose some users to a worse model.", "Decide on a fixed schedule versus decide when significance is reached: fixed schedules are predictable, and stopping when significance appears inflates false wins."],
    p: ["The challenger is compared on traffic from a different time of day than the champion and wins on seasonality.", "Outcome labels arrive weeks later and the decision is made before they exist."],
    v: "Route 5 percent of replayed traffic to a challenger and the rest to the champion. The record shows per-version request counts matching that split, metrics for each, and the decision and decider when a switch is made.",
    dep: ["stages-and-aliases", "deployment-connectors", "evaluation-reports"]
  },
  "rollback-and-demotion": {
    s: "Returning a previous version to service and marking a bad one as not to be used, quickly and with a record of why.",
    d: "Because aliases point to immutable versions, rollback is moving the alias back to the earlier version, which remains stored and unchanged. Demotion marks the faulty version so tooling refuses to select it again. Both actions should be allowed with fewer approvals than a normal promotion since speed matters, and both emit events so serving systems pick up the change. The hard part is that rollback is only safe if the old version is still loadable, compatible with current features and not deleted by retention rules.",
    k: ["Fast-path rollback with after-the-fact review versus full approval: a fast path shortens outages, and removes a check exactly when judgment is worst.", "Keep all recent versions deployable versus keep only the latest artifacts: keeping them costs storage and is the only way rollback works reliably."],
    p: ["The previous version's artifacts were removed by cleanup and rollback fails during the incident.", "The old model expects an input field that a feature pipeline stopped producing, so rollback loads and returns wrong answers."],
    v: "Promote version 8, then roll back to version 7. The alias resolves to 7 within seconds, version 8 carries a demotion reason, and serving instances load 7 successfully from stored artifacts.",
    dep: ["stages-and-aliases", "model-versions", "artifact-cleanup", "webhooks-and-events"]
  },
  "deprecation-and-retirement": {
    s: "Marking models and versions as obsolete, warning anyone still using them, and eventually removing them without breaking downstream systems.",
    d: "Deprecation sets a state and a date. The registry then shows warnings on lookup, reports consumers still resolving the model from access logs and deployment records, and blocks new aliases. Retirement removes serving access and, after a retention period, the artifacts, while keeping the metadata and lineage. The hard part is discovering consumers: usage the registry cannot see, such as a model file copied into another repository, is only discovered when it breaks.",
    k: ["Soft deprecation with warnings versus hard removal on a date: warnings give owners time, and many never read them; a hard date forces action and can break a forgotten consumer.", "Delete artifacts at retirement versus keep them under retention: deletion saves storage, while retention supports audits and later reproduction."],
    p: ["A model is retired while a batch job that runs quarterly still resolves it and fails months later.", "Metadata deleted with the artifacts removes the evidence of what was once deployed."],
    v: "Deprecate a version that one serving instance still uses. Resolving it returns a deprecation warning, the usage report lists that instance, and attempts to alias it for new deployment are refused.",
    dep: ["model-versions", "access-audit-log", "retention-policies"]
  },
  "promotion-history": {
    s: "An append-only log of every stage change, alias move, approval and rollback, with who did it, when and on what evidence.",
    d: "Each change writes an entry containing the version, previous and new state, actor, request or ticket reference, and the gate results at the time. Entries cannot be edited, only followed by new entries. The log answers what was in production on a given date and who decided, which is needed for incident review and audits. The difficulty is making it trustworthy: it must record automated and manual changes through every path, including direct API calls.",
    k: ["Event log as the source of truth versus current state with a log beside it: deriving state from events guarantees consistency and costs query complexity; a side log is simple and can miss a path.", "Store gate results in the entry versus reference them: storing keeps evidence readable after metrics change, and duplicates data."],
    p: ["An administrative script moves aliases straight in the database and leaves no history entry.", "The log records the service account that applied a change and not the human who requested it."],
    v: "Pick any date in the past and ask which version held the production alias. The answer comes from the log, names the actor for that change, and matches what the deployment records say was loaded then.",
    dep: ["metadata-database", "authentication"]
  },
  "model-cards": {
    s: "A structured document attached to a model version describing what it is, how it was built and tested, and where it should and should not be used.",
    d: "A card has fixed sections: purpose, training data, evaluation results, limitations, ethical considerations, owners and version. Much of it is generated from the registry, including the run's parameters, metrics, data and code versions, and the rest is written by the model owner. The card is stored with the version and changes are versioned. Its value depends on being specific; generic text satisfies a gate and informs no one.",
    k: ["Generate from records versus write by hand: generated content stays true as data changes and is dry; hand-written context is the only place for judgment and tends to go stale.", "One card per model versus one per version: per-model cards are easier to maintain and mislead when versions differ, per-version cards are accurate and multiply the writing."],
    p: ["A card is written once for version 1 and describes training data that version 6 no longer uses.", "Cards are filled with boilerplate to pass the promotion gate."],
    v: "Open the card for a promoted version and check that every figure in the results section matches the linked evaluation run, that the data version equals the one in lineage, and that all required sections have non-empty, version-specific text.",
    dep: ["model-versions", "evaluation-reports", "dataset-documentation", "version-to-run-link"]
  },
  "intended-use-and-limits": {
    s: "The statement of what a model is meant to do, for whom, and the conditions where its output should not be trusted or used.",
    d: "This section names the intended task and users, supported inputs and ranges, known failure modes, populations or conditions with weaker performance, and uses that are out of scope. It is maintained by the model owner, reviewed during approval, and shown to consumers in the registry and at deployment time. Where possible, limits are expressed as checks, such as an input range or a language list, so the serving layer can enforce them. Plain prose is easy to write and impossible to enforce.",
    k: ["Prose limits versus machine-checkable constraints: prose is expressive and ignored by software; constraints can block bad calls and only capture what can be stated formally.", "Owner-written limits versus limits derived from evaluation slices: owners know context, slice results show failure that owners have not noticed."],
    p: ["A model built for one region is reused elsewhere because the limit sits in a document nobody opens.", "Limitations list generic caveats and omit the specific failure that incident review later finds."],
    v: "Check that each stated limit either has a linked evaluation slice showing the weaker result or a signature constraint that rejects an out-of-scope input at serving time.",
    dep: ["model-cards", "model-signature", "evaluation-reports"]
  },
  "evaluation-reports": {
    s: "Stored results of testing a model version on defined datasets, including overall and per-slice metrics, comparisons to earlier versions and the evaluation setup.",
    d: "An evaluation is itself a run that takes a version and a dataset snapshot and writes metrics, plots and example errors back to the version. The report records the metric definitions, dataset version, code version and thresholds, so numbers can be compared fairly. Slice metrics split results by group or condition. Reports feed gates, cards and champion comparisons. The core risk is comparability: two versions are only comparable if they were measured the same way on the same data.",
    k: ["Evaluation as a separate run versus metrics from the training run: a separate run uses independent data and code and costs extra compute; training metrics are free and can be optimistic.", "Fixed benchmark versus rotating fresh data: a fixed set gives stable comparison over time, fresh data resists overfitting to the benchmark."],
    p: ["Metric code changes between two evaluations and the version-to-version delta reflects the code, not the model.", "Only the headline metric is stored, and later nobody can see which slices regressed."],
    v: "Re-run the evaluation for an existing version against its pinned dataset snapshot and confirm headline and slice metrics match the stored report within a declared tolerance.",
    dep: ["model-versions", "data-snapshot-pinning", "run-lifecycle", "summary-metrics"]
  },
  "fairness-and-risk-assessment": {
    s: "A recorded assessment of how a model performs across groups and what harm it could cause, with mitigations and the name of who accepted the remaining risk.",
    d: "The assessment combines slice-level metrics across defined groups, a review of possible misuse and failure consequences, and a risk rating set by policy. It records mitigations such as thresholds, human review steps or restricted deployment, and the person or board that accepted the residual risk. High-risk models may require a fresh assessment on every version. The work is partly measurement and partly judgment; the system's job is to make both evidence and decision attributable.",
    k: ["Mandatory assessment for every version versus only for risky changes: every version is safest and slows releases; selective review depends on a reliable rule for what counts as significant.", "Group metrics measured on logged data versus on a dedicated audit set: logged data is plentiful and may lack group labels; audit sets are accurate and small."],
    p: ["Group attributes are not available in the data, so the assessment reports no disparity because nothing was measured.", "Risk is accepted once and silently carried onto new versions with different behavior."],
    v: "For a high-risk model, create a new version and try to promote it. The gate demands a new assessment linked to that version, and promotion succeeds only when it carries per-group metrics and a named acceptor.",
    dep: ["evaluation-reports", "approval-workflows", "model-cards"]
  },
  "dataset-documentation": {
    s: "Records describing the data a model was trained and tested on: source, collection method, time range, known biases, labels and permitted use.",
    d: "Each dataset version links to a description of where its data came from, how it was sampled and labeled, what was removed, and under what terms it may be used. The registry surfaces this on the model card through the lineage link. Statistics such as class balance and missing values are computed when the dataset is registered. Hard part: documentation belongs to the data team, while the consumer is the model team, so ownership has to be explicit or the record is empty.",
    k: ["Documentation required at dataset registration versus at model registration: requiring it early catches gaps at the source and slows data teams; requiring it later is cheaper and finds problems when data is already used.", "Computed statistics versus written descriptions: computed values are objective and say little about meaning; written text carries meaning and drifts."],
    p: ["A dataset is updated in place and the description still claims the old collection period.", "License or consent terms are recorded in prose and never checked against how the model is deployed."],
    v: "Open the lineage of a promoted model and follow the link to each dataset. Every dataset version has a populated description, computed statistics and a stated permitted use, and its identity matches the version recorded at training.",
    dep: ["dataset-version-links", "lineage-graph", "model-cards"]
  },
  "compliance-export": {
    s: "A packaged export of everything an auditor needs for a model: lineage, evaluations, approvals, cards, access records and deployment history, in a fixed format.",
    d: "The export collects the version's records into a signed bundle, resolving references to datasets, code and runs at a given moment. It includes the promotion log and relevant access logs. Regulators and internal auditors ask the same questions repeatedly, so templates map recorded fields onto the headings they expect. The difficulty is completeness over time: anything deleted by retention or never captured cannot appear, and a bundle that looks complete but omits a missing section is worse than a failed export.",
    k: ["Generate on request versus snapshot at promotion: on request is always current, a snapshot at promotion shows exactly what was approved and cannot reflect later events.", "Include raw records versus summaries: raw records are verifiable and may expose personal or confidential data; summaries are safe and need trust."],
    p: ["Export succeeds with empty sections when the lineage for an old run was never captured.", "A bundle includes user identifiers that the retention policy says should have been removed."],
    v: "Export the bundle for a promoted version, then verify its signature and compare its listed run, dataset and approval identifiers with the live records. Exporting a version with missing lineage reports the gap explicitly.",
    dep: ["promotion-history", "access-audit-log", "lineage-graph", "evaluation-reports", "model-cards"]
  },
  "registered-models": {
    s: "A named, stable entry in the registry representing one logical model, such as a fraud scorer, under which all of its versions are collected.",
    d: "A registered model has a unique name within its workspace, a description, an owner, tags and a list of versions. The name is the handle consumers use, so renaming is expensive and usually forbidden or aliased. Permissions are commonly set at this level. It is the unit that is deployed and discussed. The design question is granularity: one entry per business task keeps versions comparable, and one per training configuration scatters history.",
    k: ["Name encodes task versus name encodes variant: a task name keeps all versions comparable in one place, variant names are explicit and fragment the version history.", "Permissions per model versus per workspace: per-model rules protect sensitive models and multiply administrative work."],
    p: ["Teams register a new model per experiment and the registry fills with hundreds of one-version entries.", "Renaming a model breaks every consumer that resolves it by name."],
    v: "Create a model and register three versions. Listing the model shows one entry with three versions in order, a stable name resolving through the API, and a rename attempt is either refused or leaves the old name working.",
    dep: ["model-versions", "workspaces", "authorization-and-roles"]
  },
  "model-versions": {
    s: "An immutable, numbered snapshot of a model's files and metadata under a registered model, pointing to the run that produced it.",
    d: "Registering a version freezes a reference to a set of stored files with checksums, along with the signature, metadata, tags and source run. Version numbers increase monotonically and are never reused. Content cannot change; a fix is a new version. State such as stage or alias lives outside the version so it can change without altering it. Immutability is what makes deployment records and audits meaningful, and it requires the underlying store to refuse overwrites.",
    k: ["Immutable versions versus editable in place: immutability makes every record trustworthy and means a small fix needs a full new version; in-place edits are convenient and break reproducibility.", "Sequential integers versus content hashes as identity: integers are human friendly, hashes prove content and are unreadable in conversation. Many systems carry both."],
    p: ["Files are overwritten in the store behind the registry and the version silently holds different weights.", "Version numbers are assumed to mean quality, so people deploy the highest one."],
    v: "Register a version, then change a file in the artifact location by hand. A checksum verification on load detects the change and refuses the model, and the version's recorded checksums still equal the originals.",
    dep: ["registered-models", "object-store", "version-to-run-link", "content-addressing"]
  },
  "version-metadata-and-tags": {
    s: "Free-form notes, key-value tags and structured fields on a model version, used to search, filter and carry context the registry itself does not model.",
    d: "Metadata includes description, creator, creation time, source run, training metrics copied for convenience, and arbitrary tags. Tags drive organization: team, task, data region, regulatory class. Some are mutable, like a review status, while core fields are immutable. Policies can require certain tags, and gates and searches read them. The challenge is discipline: without an enforced vocabulary, tags diverge across teams and become impossible to query reliably.",
    k: ["Free-form tags versus a controlled vocabulary: free-form tags are flexible, a controlled vocabulary makes queries and policies reliable and needs maintenance.", "Copy metrics onto the version versus link to the run: copies make lists fast and can disagree with the run; links are authoritative and need a join."],
    p: ["Tags such as prod and production both exist and filters find only half the models.", "A mutable tag is used as an approval flag and anyone with write access can set it."],
    v: "Set a required tag policy, then register a version without it and confirm the request is rejected. Search by that tag across two teams' models and check results exactly match the versions that carry it.",
    dep: ["model-versions", "search-index", "authorization-and-roles"]
  },
  "model-signature": {
    s: "A declared schema for a model's inputs and outputs, with names, types and shapes, used to validate calls and to check version compatibility.",
    d: "The signature is inferred from sample data at logging time or declared explicitly, and stored with the version. Serving layers use it to reject malformed requests, and the registry uses it to compare versions: a new version with a different input schema is a breaking change. For tabular models it lists columns and types, and for tensors, shapes and element types. It cannot describe meaning; two columns with the right types but swapped contents pass the check.",
    k: ["Inferred signatures versus declared signatures: inference is automatic and guesses from a few samples; declaration is exact and requires effort.", "Strict validation at serving versus permissive: strict validation catches errors early and rejects harmless extra fields; permissive handling is tolerant and lets silent mistakes through."],
    p: ["A signature inferred from a sample with no missing values rejects real traffic that contains nulls.", "An integer column is inferred from a few rows and later receives floats."],
    v: "Register a version, then call it with a field of the wrong type and with a field missing. Both calls are rejected using the stored signature, and comparing it to the next version reports the changed column.",
    dep: ["model-versions", "model-packaging"]
  },
  "model-packaging": {
    s: "The standard layout and format that bundle model weights, preprocessing, dependencies and a loading entry point so any consumer can load a version the same way.",
    d: "A package contains the serialized model, a description of the format or flavor, the required software environment, the signature and sample input. A generic loading interface lets deployment tooling call the model without knowing the framework. Some formats are portable across runtimes and others tie to one framework version. Packaging has to include preprocessing, because a model without its feature code gives wrong answers while appearing to load. Serialization formats that execute code on load are a security risk.",
    k: ["Portable interchange format versus native framework format: interchange runs on many runtimes and supports fewer operations; native keeps full fidelity and ties deployment to one stack.", "Include preprocessing in the package versus in the serving code: bundling keeps behavior identical and enlarges the package; separate code is flexible and drifts."],
    p: ["A model loaded from an untrusted package executes code embedded in its serialized file.", "The package omits the tokenizer or scaler and loads fine but predicts nonsense."],
    v: "Load a version in a clean environment built only from the package's declared dependencies, using only the generic loader, and confirm its predictions on the stored sample input match the values recorded at logging.",
    dep: ["model-signature", "dependency-capture", "artifact-upload"]
  },
  "version-to-run-link": {
    s: "The stored reference from every model version to the run that produced it, which opens the full training record behind a deployed model.",
    d: "At registration, the version records the run identifier and the artifact path within that run. From it the registry reaches parameters, metrics, code and data lineage, environment and logs. The link is the join between the registry and the tracker, and underpins cards, audits and rollback decisions. It breaks when runs are deleted or moved, when a model is registered from a file with no run, or when a model is the product of several runs, such as pretraining followed by tuning.",
    k: ["Mandatory link versus optional: mandatory links guarantee provenance and block registering imported or hand-built models; optional links are flexible and leave unexplained versions.", "Single source run versus a set of runs: one run is simple, a set represents multi-stage training and complicates every provenance question."],
    p: ["Retention deletes the run while the version lives on, and the audit trail ends at a dead identifier.", "A model fine-tuned from another links only to the tuning run and hides the base model's lineage."],
    v: "Pick a deployed version and follow its link to the run. The run's final artifact checksum equals the version's, and the run lists the code commit and data version the registry shows.",
    dep: ["model-versions", "run-identity", "artifact-versions-and-aliases"]
  },
  "registry-search": {
    s: "Finding models and versions by name, tag, metric, owner, stage or lineage, used by deployers, reviewers and people looking for an existing model before training a new one.",
    d: "Search covers registry fields and can reach into linked run data, such as best validation score or training dataset. It returns results filtered by what the caller may see. Typical queries are the latest version in a given state, every version trained on a dataset affected by a defect, or all models owned by a leaving team. The last two require lineage in the index. Keeping the registry index consistent with the primary store is the operational challenge.",
    k: ["Query the primary store directly versus maintain a separate index: direct queries are always correct and slow for text and cross-entity questions; an index is fast and can lag.", "Show only permitted results versus show existence and hide detail: hiding everything is safest, and showing existence helps people discover models and leaks what exists."],
    p: ["The index lags after a promotion and a deploy tool reads a stale answer.", "Search results show names of models in projects the user has no right to know about."],
    v: "Register a version tagged with a dataset, then immediately search for versions trained on that dataset. It appears within the documented index delay, and a user without access to the workspace does not see it.",
    dep: ["search-index", "lineage-queries", "authorization-and-roles"]
  },
  "registry-copy": {
    s: "Copying a model version from one workspace or environment registry to another, keeping its files, metadata and a link back to where it came from.",
    d: "Organizations often keep development, staging and production registries separate for access control. Promotion across them copies the version's files and metadata to the destination, verifies checksums, and records the source registry, version and run. The destination version is new, with its own number, and its provenance field names the origin. Lineage then crosses a boundary the destination cannot always read. The record must carry enough evidence to be trusted without access to the source.",
    k: ["Copy files to the destination versus reference the source store: copying isolates environments and doubles storage; references save space and make production depend on the development store.", "Carry the full history across versus a summary: full history is auditable and may expose development details; a signed summary is compact and requires trust in the signer."],
    p: ["The copy changes the file layout slightly and checksums no longer match the source, breaking verification.", "Production cannot resolve the source run and shows lineage as unknown."],
    v: "Copy a version from staging to production. File checksums match at both ends, the new version names the source registry, version and run, and the source is unaffected if the destination copy is deleted.",
    dep: ["model-versions", "object-store", "workspaces", "promotion-history"]
  },
  "external-model-import": {
    s: "Registering models not trained in the tracker, such as a downloaded pretrained model or a vendor-delivered one, with source, license and checks recorded in place of a run.",
    d: "An imported version has no training run, so provenance fields are filled with the source location, a hash of the files, license, the person who imported it and a scan result. Policy can require review before such models enter the registry. Import lets a single deployment path serve both internal and external models. The difficulty is that what is recorded about the origin is a claim by the importer, and external weights may carry unknown training data and unsafe serialized code.",
    k: ["Treat imported models as first-class versus quarantined: first-class treatment unifies deployment and risks skipping the scrutiny external models need; quarantine forces review and slows adoption.", "Mirror the files internally versus reference the origin: mirroring protects against disappearance and tampering at a storage cost."],
    p: ["A model pulled from a public hub is later replaced upstream and the unrecorded hash cannot show that it changed.", "An imported file is loaded without scanning and executes embedded code."],
    v: "Import an externally supplied model. The version records source URL, file hash, license and importer, a scan result is attached, and a version without a license field is blocked from promotion.",
    dep: ["model-versions", "model-packaging", "approval-workflows", "object-store"]
  },
});
