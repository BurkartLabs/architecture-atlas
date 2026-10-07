// Details for the feature store plate, part 3: online serving and training data.
ATLAS.details("feature-store", {
  "online-lookup-api": {
    s: "The network endpoint that takes entity keys and a feature list or service name and returns the latest feature values in a few milliseconds.",
    d: "Exposed over HTTP or a binary RPC protocol, the API accepts one or many entity keys plus a feature service, and returns values with their types and optionally timestamps and status. It authenticates the caller, resolves the service against the registry, fans out reads to the online store, merges request-time values and replies. It sits on the critical path of every prediction, so tail latency, availability and backpressure behavior matter more than average speed.",
    k: ["Single-entity calls versus batched calls: single calls are simple and low latency, batches amortize network cost for ranking many candidates but make the slowest key set the response time.", "Synchronous lookup service versus embedded client reading the store directly: a service centralizes logic and security, an embedded client removes a hop but spreads credentials and logic."],
    p: ["Retries from many clients during a slowdown multiply load and turn a brief stall into an outage.", "The response carries values with no status, so callers cannot tell a missing entity from a stale or defaulted value."],
    v: "Send load at the expected request rate with realistic key distributions and confirm the p99 latency meets the documented budget; then kill one online store replica and confirm error rate stays within the objective.",
    dep: ["feature-service-resolver", "entity-key-resolution", "key-value-store", "response-assembly", "access-control"]
  },
  "entity-key-resolution": {
    s: "Turns the identifiers a caller has, such as a login or device id, into the entity keys the stored features are indexed by, applying the same mapping used in training.",
    d: "Callers often hold a different identifier than the one features are keyed by. Resolution applies the mapping, converts types and normalizes values, for example case and padding, and computes composite keys. If the mapping is wrong or differs from the offline one, lookups quietly miss and return defaults. The mapping data is itself a feature of sorts: it changes over time, so resolving as of the request time matters for accounts that merge or split.",
    k: ["Resolving in the store versus in the caller: in the store gives one correct implementation, in the caller saves a hop but spreads logic that must stay in sync.", "Cached mappings versus live lookups: caching is fast and tolerates mapping outages but serves stale mappings after merges."],
    p: ["Whitespace or case differences between training and serving cause every lookup for some users to miss, and the model sees defaults for them.", "An account merge leaves the old key pointing at a row that is no longer updated."],
    v: "Look up the same logical user by each identifier the callers use and confirm all resolve to the same key and return identical values, and that an unknown identifier returns an explicit not-found status.",
    dep: ["entity-key-mapping", "entity-definitions"]
  },
  "feature-service-resolver": {
    s: "Expands a requested feature service into the concrete views, columns and request-time computations to read, using the registry's current definitions and pinned versions.",
    d: "On each request, or from a cached plan, the resolver determines which online tables hold each feature, which are on-demand, and the order in which on-demand features depend on stored ones. It groups reads by table to minimize round trips and applies renames. Plans are cached per service version, and invalidated when the registry changes. A wrong plan returns the wrong column or leaves some out, which no type check on the caller's side will notice.",
    k: ["Resolving per request versus caching plans: per-request is always correct but costs registry time, cached plans are fast but must be invalidated on every relevant change.", "Strict failure when a feature is missing versus partial answers: strict failure is safe and visible, partial answers keep the product running with silently degraded inputs."],
    p: ["A cached plan survives a view change and keeps reading a column that is no longer materialized.", "Feature order in the response differs from the order the model expects after a service edit."],
    v: "Request a service that spans three views and confirm the response contains each feature in the registered order, with the resolver issuing one read per table; change the service and confirm the new plan applies within the cache TTL.",
    dep: ["metadata-registry", "feature-services", "feature-row-layout"]
  },
  "request-time-features": {
    s: "Values that exist only at the moment of the request, such as the current search query or cart contents, passed by the caller and combined with stored features.",
    d: "Some of the most predictive inputs cannot be precomputed. The caller supplies them in the request; the store validates their types, makes them available to on-demand transformations and returns them with the stored values. For training, the same values must be recorded and supplied as part of the training spine, since the store has no history of them. Their defining risk is that they come from the caller's own code path, outside the store's control.",
    k: ["Caller-supplied values versus store-computed values: caller-supplied are always available and current, but are another place for training and serving to disagree.", "Validating request values strictly versus passing them through: strict validation catches bugs early and rejects requests, passthrough keeps serving at the cost of garbage reaching the model."],
    p: ["Training reconstructs the value from a log with slightly different logic, so offline and online disagree on the most important feature.", "A caller changes the unit or format of a field with no coordination with the model team."],
    v: "Send requests with a request-time value in range, out of range and missing; confirm they are used, rejected with an error and defaulted respectively, and that each is recorded in the feature log.",
    dep: ["on-demand-transformations", "feature-logging", "spine-and-labels"]
  },
  "on-demand-transformations": {
    s: "Transformations evaluated at request time from stored features and request-time inputs, such as a ratio of a stored count to the current value, executed with the same code used for training.",
    d: "These functions run inside the serving path, so they must be fast, deterministic and free of external calls. The engine passes in the fetched stored features and the request values, runs the function and appends the results. For training, the identical function is run over the joined offline data, which is how consistency is kept. Costs are in latency, since the code executes per request, and in sandboxing, since users supply it.",
    k: ["On-demand versus precomputed: on-demand gives exact freshness and no storage, precomputation is faster to serve and needs materialization.", "Running user code in the serving process versus a separate sandbox: in-process is fast, a sandbox isolates failures at the cost of an extra hop."],
    p: ["A transformation allocates heavily or loops on edge cases, and a single bad request consumes a worker for seconds.", "The function is vectorized for training and written differently for single rows at serving, and they disagree on nulls."],
    v: "Evaluate the transformation on one hundred sample rows through the offline path and the online path and confirm identical outputs, and measure its p99 execution time within the latency budget.",
    dep: ["udf-runtime", "shared-transform-logic", "latency-budgeting"]
  },
  "response-assembly": {
    s: "Merges values fetched from several tables, request-time inputs and on-demand outputs into one ordered, typed response, with per-feature status and metadata.",
    d: "After the parallel reads complete, assembly lines values up with the requested names, converts stored encodings to the declared types, applies defaults and expiry checks, and attaches timestamps and status such as present, not found or expired. It enforces the order models expect and drops anything not requested. Errors in a single read are handled per feature, not per request, so one failing view does not discard the rest. It is small code that determines what the model sees.",
    k: ["Returning status per feature versus a flat values array: status lets callers handle missing data deliberately, a flat array is smaller and simpler for tight loops.", "Failing the request on any error versus partial responses: failing is predictable, partial responses preserve availability but need callers who respect the status."],
    p: ["Type conversion rounds or truncates values compared with the offline path, creating a small systematic skew.", "A timed-out read yields a default that is indistinguishable from a real value."],
    v: "Request a service with one missing entity, one expired value and one unavailable view, and confirm each feature carries the correct distinct status and the rest of the response is intact and in order.",
    dep: ["default-and-fallback-values", "feature-row-layout", "feature-service-resolver"]
  },
  "serving-clients": {
    s: "The libraries inference code uses to call the store: connection pooling, batching, timeouts, retries and the translation of responses into the model's input format.",
    d: "Clients hide protocol details and implement the behaviors that make a service usable under load: connection reuse, deadline propagation, bounded retries with jitter, hedged requests for slow replicas and circuit breaking. They convert results to arrays or tensors in the order the model expects. A client is deployed inside many applications, so its upgrade cadence is slow, and defaults chosen here, such as timeouts, are set in many places at once.",
    k: ["Aggressive retries and hedging versus fail fast: retries and hedges cut tail latency, but multiply load during incidents; fail fast protects the backend but surfaces more errors.", "One client per language versus a thin protocol with shared sidecar: per-language clients feel native but diverge, a sidecar is consistent and adds a hop."],
    p: ["Client timeouts exceed the model's own deadline, so the caller has already given up when the store answers.", "Old client versions in production keep calling a deprecated endpoint, which then cannot be removed."],
    v: "Inject a slow replica and confirm the client's hedging or timeout keeps its p99 under the budget and does not increase total backend request rate by more than the configured fraction.",
    dep: ["online-lookup-api", "latency-budgeting"]
  },
  "serving-cache": {
    s: "Keeps hot entities' feature rows in memory in or near the serving process, to cut latency and protect the online store from repeated reads of the same keys.",
    d: "A local or shared cache holds recently read rows with a short time to live. It helps skewed traffic where a few entities dominate, and when the store is slow. The cost is staleness: a cached row can be older than the freshness target, and different instances may hold different versions. Negative caching of not-found results saves lookups for unknown keys, and risks hiding a newly created entity until it expires.",
    k: ["Short TTL versus long TTL: short TTLs keep values within the freshness target and reduce hit rate, long TTLs raise the hit rate and break freshness guarantees.", "Per-instance cache versus shared cache tier: per-instance is fastest and inconsistent between instances, shared is consistent and adds a network hop."],
    p: ["The cache TTL is longer than a streaming view's freshness target, so a fast pipeline is made slow without anyone noticing.", "A deploy empties every instance's cache at once, and the stampede overwhelms the online store."],
    v: "Update a feature value in the store and measure how long lookups keep returning the old value; the delay must not exceed the view's declared freshness target.",
    dep: ["memory-tier", "online-lookup-api", "freshness-slos"]
  },
  "latency-budgeting": {
    s: "Allocates the total time a prediction may spend on features across network, store reads, transformations and assembly, and enforces deadlines when a part exceeds its share.",
    d: "A request has a deadline set by the product, and the feature fetch gets a fraction. The budget is split among parallel reads, on-demand computation and serialization, and each stage receives a deadline derived from what remains. When the budget runs out, the system returns what it has, with defaults for the rest, instead of waiting. Budgets guide design choices, such as limits on the number of tables per service and the cost of on-demand code.",
    k: ["Hard deadlines with defaults versus waiting for all features: hard deadlines bound latency and degrade model input, waiting is complete and risks missing the product deadline.", "Per-stage budgets versus a single overall deadline: per-stage budgets locate regressions, a single deadline is simpler and lets stages borrow time."],
    p: ["Budgets are measured at the median in tests and violated at the tail in production, where fan-out makes slowest-read latency dominate.", "A degraded response is used silently, and the model's accuracy falls without an alert tied to timeouts."],
    v: "Add artificial delay to one store table and confirm the response returns by the deadline with that table's features marked defaulted, and that the timeout is counted in metrics.",
    dep: ["online-lookup-api", "default-and-fallback-values", "metrics-and-tracing"]
  },
  "default-and-fallback-values": {
    s: "Defines what the model receives when a value is missing, expired or unreachable: a constant, a population statistic, the last known value or an explicit missing marker.",
    d: "Missing data is routine: new entities with no history, expired rows, timeouts. Each feature declares a policy so that behavior is intentional. A constant zero is easy and conflates absence with a real zero, so a separate indicator or a missing marker is often better. Whatever is chosen must match what training saw for missing data, or the model meets a distribution it was never trained on. Policies should also be logged, so analysis can separate real from defaulted values.",
    k: ["Constant defaults versus population statistics: constants are simple and predictable, statistics put a typical value in but can hide how many entities are missing.", "Last known value versus fresh default on failure: last known value is smoother, but may be arbitrarily old if the pipeline has been broken for days."],
    p: ["Training data fills missing values with the column mean while serving uses zero, so every new entity is scored on a different input than the model learned.", "A failing view serves defaults for all entities and the model keeps predicting with no visible error."],
    v: "Look up an unknown entity and a known one and confirm the unknown returns the declared default with a not-found status; compare the training data for entities without history and confirm it holds the same default.",
    dep: ["feature-definitions", "feature-logging"]
  },
  "training-set-builder": {
    s: "Takes a list of entities, timestamps and labels, plus a feature service, and produces a dataset where every row has the feature values that were known at its own timestamp.",
    d: "The builder reads the registry to see which views are needed, generates the join plan, pushes the work to the offline engine and writes the result. It handles many views with different entities and time columns, on-demand transformations and renames. The workload is large: joining thousands of features over history for millions of examples. Plans that look reasonable on small data can run for hours at scale, so partitioning and join order matter.",
    k: ["Building datasets on demand versus pre-building them: on demand is flexible and always uses the latest definitions, pre-building is faster to start and fixed once produced.", "One large join versus per-view joins merged later: one join is simple but memory-heavy, per-view joins parallelize but need a stable merge key."],
    p: ["The spine contains duplicate entity-time pairs and the join fans out, doubling some training rows.", "A rebuilt dataset differs from the previous one because a source table changed, and nobody records that."],
    v: "Build a dataset for a small spine and verify a sample of rows against manual queries of the feature tables as of each timestamp; the counts must equal the spine row count with no duplicates.",
    dep: ["spine-and-labels", "point-in-time-join", "offline-query-engine", "feature-service-resolver", "leakage-guard"]
  },
  "spine-and-labels": {
    s: "The caller-supplied table of entity keys, event timestamps and label values that defines which examples exist and as of when each one's features must be computed.",
    d: "The spine is the training set's skeleton. Each row says: for this entity at this moment, here is the outcome. Features are attached by looking up the entity's history as of the row timestamp. The choice of timestamp is the subtle part: it must be when the prediction would have been made, not when the label was observed. Spines can also carry request-time feature values and weights. Their correctness is the caller's responsibility, and it is where most leakage is introduced.",
    k: ["Timestamp at prediction time versus at label time: prediction time is correct and may require reconstructing it from logs, label time is easy to obtain and leaks the future.", "Spine from logged requests versus synthetic from events: logged requests match serving exactly, synthetic spines can cover history before logging began."],
    p: ["The timestamp is the time the label was recorded, which is days after the prediction, so features include information the model will never have.", "Spine entities are sampled by outcome, which changes class balance silently."],
    v: "For a sample of spine rows, compare each timestamp with the actual time the production model scored that example, using request logs; they must match within clock tolerance.",
    dep: ["entity-definitions", "event-time-and-watermarks"]
  },
  "point-in-time-join": {
    s: "For each spine row, picks the latest feature value at or before the row's timestamp within an allowed window, so training sees only what was known then.",
    d: "An as-of join matches each entity-time to the newest feature row not later than that time and not older than the view's time-to-live. At scale this is run as sorted merge or window operations and is the most expensive part of dataset creation. Correctness depends on which timestamp is used: event time, or the time the value became available. A value computed from a day's events is only available after the day closes, so its effective time is later than its event time.",
    k: ["Join on event time versus availability time: event time is simple but leaks values that were not yet computed, availability time is correct and requires recording when each value landed.", "Exact as-of versus bucketed approximation: exact is right and slow, bucketed is fast and can include values from slightly after the row's timestamp."],
    p: ["A daily aggregate stamped with the day's start is joined to events during that day, so the model sees the whole day's total at noon.", "Time zones differ between spine and feature tables and values shift by hours."],
    v: "Build a tiny dataset by hand for three entities with known feature changes over time, including boundaries equal to the row time, and confirm every joined value equals the expected one.",
    dep: ["time-travel-lookback", "event-time-partitioning", "offline-query-engine", "leakage-guard"]
  },
  "time-travel-lookback": {
    s: "Limits how far back the join may look for a value and how stale a value may be before it counts as missing, so a very old record is not presented as current.",
    d: "Each view has a time-to-live saying how long a value stays valid after its timestamp. During joining, an older value than that window is treated as null, which mirrors what the online store does when a row expires. Aligning offline and online expiry is a consistency issue, and it also bounds the scan: the engine only needs to read a limited span before each row. Windows that are too wide read excessive history; too narrow produce nulls that serving would not.",
    k: ["Same TTL offline and online versus separate settings: the same value keeps behavior aligned, separate values allow cheaper scans offline at the cost of mismatch.", "Null on expiry versus carrying the last value forward: null is honest about age, carrying forward is smoother and misrepresents data that stopped updating."],
    p: ["The online store expires rows after a day while offline joins accept a week-old value, so training sees values serving would never return.", "The lookback is shorter than the job's cadence, so slow batches yield nulls for entities that merely updated less often."],
    v: "Set a one-hour window, place a value two hours before a spine timestamp and confirm the join returns null; confirm the online store also returns not found for the same age.",
    dep: ["ttl-and-expiry", "feature-views"]
  },
  "leakage-guard": {
    s: "Checks that no feature value used for a training row comes from after that row's timestamp, and flags features that look suspiciously predictive of the label.",
    d: "Guards run in two forms. Structural checks verify that every joined value's timestamp is at or before the row's, and that views have declared availability delays. Statistical checks look for features whose relationship to the label is implausibly strong, or which are nearly constant functions of it. The first prevents known mistakes cheaply; the second catches unknown ones, with false positives. Leakage often arrives through the spine or a mislabeled timestamp, which structural checks cannot see.",
    k: ["Hard failure versus warning: failing stops leaked sets reaching training, and blocks legitimate uses when availability delays are not declared.", "Statistical screening versus structural checks only: statistical screening finds unexpected leaks, but needs labels and thresholds that need tuning."],
    p: ["Checks verify the feature timestamp but not the time the underlying source row was corrected, so later fixes appear in earlier rows.", "A feature derived from the label itself, through an aggregate over the same user's outcomes, passes structural checks."],
    v: "Construct a dataset with one feature deliberately stamped after the row time and confirm the guard fails the build naming that feature; build a clean dataset and confirm it passes.",
    dep: ["point-in-time-join", "metadata-registry"]
  },
  "dataset-snapshots": {
    s: "Saves a built training set with the definitions, versions, time ranges and source snapshots that produced it, so it can be named, reused and rebuilt later.",
    d: "A snapshot stores the data, or enough information to rebuild it, along with metadata: feature service version, spine reference, point-in-time settings and table snapshot identifiers. Models trained on a snapshot record its identifier, which links a deployed model to its exact inputs. Storing full copies costs space and spreads sensitive data; storing only recipes is cheap but depends on source tables not changing, which needs table-level snapshots.",
    k: ["Materialized copy versus recipe: a copy is exact and fast to reuse, a recipe saves storage and fails if upstream data is rewritten or expired.", "Long retention versus short: long retention allows audits and re-training, short retention limits storage and exposure of personal data."],
    p: ["A snapshot refers to a table version that has been compacted away, so it can no longer be rebuilt.", "Copies of snapshots proliferate in personal storage and survive deletion requests."],
    v: "Build a snapshot, change an upstream source, then rebuild from the snapshot's recorded recipe and confirm the result is identical to the original, row for row.",
    dep: ["training-set-builder", "table-snapshots", "metadata-registry"]
  },
  "training-export": {
    s: "Delivers a built dataset to the training platform in the format and location it reads: files, a table, or a streaming loader, with a schema matching the model's inputs.",
    d: "Training frameworks read sharded files, tables or data loaders. The export writes columns in the order and types the model expects, handles arrays and embeddings, applies encodings and chunks output for parallel readers. Large datasets must be written in a form that allows shuffling and partial reads. Export also decides how much data crosses a security boundary, since training environments often have different access rules from the feature store.",
    k: ["Files in object storage versus direct table access: files are portable and cheap, direct access avoids copies but couples training to the offline store's availability.", "Exporting raw feature values versus encoded tensors: raw keeps encoding in training code, tensors speed training and hard-wire preprocessing."],
    p: ["Column order in the export differs from the order used at serving, so the model trains on permuted inputs.", "Files are written in a single partition, so training reads on one node and wastes the cluster."],
    v: "Load the exported dataset in the training environment and confirm schema, row count and a checksum of a sample match the built dataset, and that the column order equals the serving response order.",
    dep: ["training-set-builder", "object-storage", "access-control"]
  },
  "sampling-and-splits": {
    s: "Draws subsets and divides data into training, validation and test sets in ways that respect time and entities, so evaluation is not contaminated by related rows.",
    d: "Random row-level splits put the same user or session in both train and test, which inflates scores. Splits are therefore made by entity, by time, or both, so the test set represents future, unseen data. Sampling can downsample common labels or cap very active entities, with weights recorded so metrics can be corrected. The splitting logic must be deterministic from a seed and a recorded rule, since otherwise a rebuild gives a different test set.",
    k: ["Time-based splits versus entity-based splits: time-based mirrors deployment and is sensitive to seasonality, entity-based tests generalization to new users and ignores time effects.", "Sampling in the builder versus in training code: in the builder reduces the join cost, in training code keeps the dataset complete for other uses."],
    p: ["A random split puts consecutive events of one entity on both sides and the test score is far better than production.", "Downsampling is applied before the split, changing class balance in the test set without a weight."],
    v: "Check that for a built split no entity appears in both train and test (for entity splits) or that every test timestamp is after every train timestamp (for time splits), and that rebuilding with the same seed reproduces identical membership.",
    dep: ["training-set-builder", "dataset-snapshots"]
  },
});
