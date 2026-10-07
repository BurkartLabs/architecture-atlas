// Details for the experiment tracker plate, part 4: artifacts, lineage, reproducibility.
ATLAS.details("experiment-tracker", {
  "artifact-upload": {
    s: "Sending a file or directory from a run to the artifact store and recording it against the run, with its path, size, checksum and type.",
    d: "The client computes a checksum, asks the server where to store the file, uploads directly to the object store with a short-lived signed link, and then records the artifact in the metadata database. Directories are uploaded as many files plus a manifest. Large files go in parts that can be retried individually. The record is written only after the bytes are stored, so no entry points at missing data. The weak point is the gap between the two writes, where a crash leaves orphaned bytes.",
    k: ["Direct upload to the object store versus proxying through the server: direct upload scales and keeps the tracker out of the data path; proxying simplifies access control and bottlenecks on the server.", "Record first then upload versus upload then record: record-first lets viewers see pending items and can show entries with no data; upload-first never lies and leaves orphans."],
    p: ["A crash between upload and record leaves bytes nobody references and nobody deletes.", "The signed upload link outlives its intent and is reused to overwrite another artifact."],
    v: "Upload a 5 GB file and interrupt the connection halfway. Retrying resumes the missing parts, the final stored checksum equals the local one, and the artifact record exists only after the last part is committed.",
    dep: ["object-store", "large-file-transfer", "tracking-api", "content-addressing"]
  },
  "artifact-store-layout": {
    s: "How artifact files are arranged in the object store: key naming, grouping by run or by content, manifests and the mapping from records to locations.",
    d: "A layout decides where bytes live. Path-per-run layouts put everything under a prefix for the run and are easy to browse and delete. Content-addressed layouts store each unique blob once by hash, with manifests mapping logical names to hashes. The layout affects deletion, deduplication, permissions and listing speed. Changing it later means migrating terabytes, so the choice is made early and tied to the retention model.",
    k: ["Path per run versus content-addressed blobs: paths are simple to browse, secure and delete by run; content addressing deduplicates large repeated files and makes deleting a run need reference counting.", "One bucket per workspace versus shared with prefixes: separate buckets isolate access and costs, a shared bucket is simpler to operate and relies on prefix policies."],
    p: ["Keys include user-chosen names with unusual characters and break listing or signing.", "A flat layout with millions of keys under one prefix makes listing and cleanup extremely slow."],
    v: "Given any artifact record, resolve its location and fetch the bytes. Deleting a run removes its prefix or decrements references, and a listing of the store shows no keys that lack a record after a cleanup pass.",
    dep: ["object-store", "content-addressing", "metadata-database"]
  },
  "content-addressing": {
    s: "Identifying a file by a cryptographic hash of its bytes, so identical files are stored once and any copy can be verified against its identifier.",
    d: "On upload the client hashes the content. If the server already holds that hash, nothing is transferred and the new artifact simply references the existing blob. Large files may be chunked, each chunk hashed, so that a small change re-uploads only what differs. Hashes also let consumers verify downloads and detect tampering. The cost is computing hashes over huge files, and the complication of deletion, since a blob is removed only when no artifact references it.",
    k: ["Whole-file hashes versus chunk-level hashes: whole-file hashing is simple and re-uploads everything on small changes; chunk hashing saves transfer on large similar files and needs a larger index.", "Deduplicate across workspaces versus within each: global dedup saves the most space and can leak that a given file exists; per-workspace dedup keeps isolation."],
    p: ["Reference counts drift after a crash and a blob is deleted while still referenced.", "A weak or truncated hash lets two different files collide and one replaces the other."],
    v: "Upload the same 2 GB checkpoint from two runs. The second upload transfers almost nothing, storage grows by one copy, and deleting one run leaves the other's artifact readable with a matching hash.",
    dep: ["object-store", "metadata-database", "artifact-upload"]
  },
  "checkpoint-management": {
    s: "Saving, naming, selecting and pruning the model snapshots a run writes during training, so the best or latest can be resumed or registered.",
    d: "Training writes checkpoints on a schedule. The tracker records each as an artifact tied to its step and metric values, which lets a policy keep the best few by a chosen metric, plus the latest for resumption. Checkpoints may include optimizer state and are several times larger than the model alone. Registering a model picks one checkpoint and exports the weights. Retention must balance storage cost against the ability to go back.",
    k: ["Keep latest only versus latest plus best-k: latest saves storage and cannot restore the peak; best-k preserves good models at the price of ranking and storing more.", "Full training state versus weights only: full state allows exact resumption and is much larger; weights only are small and cannot continue training faithfully."],
    p: ["The pruning policy deletes the best checkpoint because the metric was logged after the checkpoint was written.", "A checkpoint is recorded before its file finished writing and a resume loads a truncated file."],
    v: "Train with checkpoints every 100 steps and a keep-best-3 policy. Afterward exactly three best checkpoints plus the latest remain, each loadable, and the best one's step matches the summary best metric.",
    dep: ["artifact-upload", "artifact-versions-and-aliases", "summary-metrics", "artifact-cleanup"]
  },
  "artifact-versions-and-aliases": {
    s: "Treating a named artifact, such as a dataset or model file set, as a series of immutable versions with movable aliases like latest or best.",
    d: "Logging an artifact with an existing name creates a new version only if the content differs. Runs declare which artifact versions they consume and produce, and the system draws the graph between them. Aliases such as latest point to one version at a time and move; a run should record the concrete version, not the alias, or it cannot be reproduced. Artifact versions are what lineage tracks, which makes them the connective tissue between runs.",
    k: ["Record the alias a run used versus the resolved version: recording the alias is readable and loses what was actually used; the resolved version is exact, and readers need to see both.", "Automatic version on every change versus explicit commit: automatic versions never miss a change and create many; explicit commits keep history meaningful and rely on discipline."],
    p: ["A run consumed latest, the alias moved, and no one can say which dataset version trained the model.", "Logging the same content under two names produces two lineages that look unrelated."],
    v: "Log an artifact twice with identical content and once changed. Two versions exist, not three. A run that consumed latest records the concrete version number even after latest moves.",
    dep: ["content-addressing", "metadata-database", "input-output-edges"]
  },
  "large-file-transfer": {
    s: "Moving files of many gigabytes in and out of the store reliably: multipart transfer, resumption, parallel streams and integrity checks.",
    d: "Files are split into parts uploaded in parallel and committed together at the end; failed parts are retried alone. Downloads use range requests, so a partial file can resume and several parts can be read at once. Checksums are verified on arrival. Caching of recently downloaded artifacts on training machines avoids pulling the same dataset again and again. The tuning is in part size, concurrency and timeouts for networks with high latency or limited bandwidth.",
    k: ["Large parts with few connections versus small parts with many: large parts have less overhead and waste more on a failure; small parts retry cheaply and add request overhead and cost.", "Local download cache versus always fetching: a cache saves bandwidth for repeated reads and needs invalidation and disk space management."],
    p: ["An upload that never completes leaves its parts in the store accruing cost indefinitely.", "A cached file is corrupted on local disk and every later run reads it without verification."],
    v: "Transfer a 20 GB file over a link that drops twice. Both directions finish, the downloaded checksum matches, and a second download from the same machine reads from the cache with no network transfer.",
    dep: ["object-store", "rate-limiting"]
  },
  "external-references": {
    s: "Recording an artifact as a pointer to data that lives elsewhere, such as a bucket path or table, with its version and checksum, instead of copying it into the store.",
    d: "Some datasets are too large or too regulated to copy. The tracker stores the location, a version identifier or modification marker, size and a checksum or sample hash, and treats it as an artifact in lineage. Access still happens by the consumer with its own credentials. The reference is only as stable as the system it points to: unless that system versions its data, the pointer can silently refer to different content later.",
    k: ["Reference versus copy: references save storage and keep data in place with governance rules; copies freeze content and double storage.", "Verify the checksum on every use versus record it once: verification detects change and is slow for large data; recording once is fast and trusts the source."],
    p: ["A path is overwritten in place and every run that referenced it now points to different data.", "The reference includes a credential in the URL, which is then stored and displayed."],
    v: "Log a reference to an external dataset with its version marker, change the data at the source, and confirm a verification step reports a mismatch against the recorded checksum.",
    dep: ["artifact-versions-and-aliases", "dataset-version-links", "secret-redaction"]
  },
  "artifact-cleanup": {
    s: "Policies and jobs that delete artifacts no longer needed, such as old checkpoints and failed runs' files, while protecting anything referenced by a model or required by retention rules.",
    d: "Cleanup combines age and state rules with a reachability check: an artifact is eligible only if no registered version, protected run or retention hold references it. A job marks candidates, waits a grace period, then deletes and reconciles records. Dry-run reports let owners review before deletion. Storage is the largest cost in a tracker, so this is run regularly. The danger is deleting something a deployment still depends on.",
    k: ["Automatic expiry by age versus manual deletion: automatic keeps cost bounded and can delete a result someone still wanted; manual is safe and never happens at scale.", "Delete immediately versus mark then sweep: immediate deletion frees space and cannot be undone; a grace period catches mistakes and keeps cost a while longer."],
    p: ["Cleanup removes checkpoints from a run whose registered model was exported by reference to them.", "Records are deleted but object keys remain, so cost does not fall."],
    v: "Run cleanup in dry-run mode, review the candidates list, then run it for real. Artifacts referenced by a registered version survive, listed ones are gone from both records and store, and byte count drops by the reported amount.",
    dep: ["object-store", "retention-policies", "version-to-run-link", "artifact-store-layout"]
  },
  "code-version-capture": {
    s: "Recording exactly which source code produced a run: commit identifier, branch, remote, and any uncommitted changes.",
    d: "At run start the client asks the version control system for the current commit and checks whether the working tree has modifications. A dirty tree is saved as a patch or archive with the run so uncommitted work is not lost. The record includes the entry point and relevant configuration files. It lets anyone check out the same code. Notebooks and generated code lack a commit, so the cell contents or script text must be stored directly.",
    k: ["Record commit only versus also store the diff for a dirty tree: commit-only is light and wrong whenever the tree was dirty; saving the diff is exact and stores code that may not be meant to leave the machine.", "Require a clean tree versus allow dirty: requiring clean gives exact provenance and slows experimentation; allowing dirty is fast and weakens the record."],
    p: ["The commit is recorded but a local edit changed the result, and checking out that commit does not reproduce it.", "The capture runs in the wrong directory when launched by a scheduler and records the scheduler's repository."],
    v: "Run a script with an uncommitted edit. The run records the commit, flags the tree as dirty and stores a patch; applying the patch to that commit gives code whose hash equals the script that ran.",
    dep: ["environment-capture", "run-identity"]
  },
  "dataset-version-links": {
    s: "The recorded connection from a run to the exact dataset versions it read for training, validation and testing.",
    d: "Data may be versioned by a data versioning system, a table snapshot or an artifact. The training code declares its inputs, or the client detects them, and the tracker stores identifier, version and checksum for each. These links make a model's behavior attributable to data and let a bad dataset version be traced to every affected model. They are only as good as the data layer: if the source does not offer immutable versions, the link says little.",
    k: ["Explicit declaration versus automatic detection: explicit links are accurate and depend on developers remembering; automatic detection catches everything the tooling sees and misses reads through custom code.", "Link to a dataset name with a date versus a snapshot identifier: a date is easy to record and ambiguous; a snapshot identifier is exact and requires a snapshotting source."],
    p: ["Training reads a live table with no snapshot, so the recorded name does not identify the rows used.", "Validation data is not declared and the linkage looks complete while missing a split."],
    v: "Train on dataset version 12, then publish version 13. The run's record still names version 12 with its checksum, and querying for runs that used version 12 returns it and not version 13's runs.",
    dep: ["artifact-versions-and-aliases", "external-references", "lineage-graph", "data-snapshot-pinning"]
  },
  "lineage-graph": {
    s: "The stored graph connecting datasets, code, runs, artifacts and model versions through consumed-by and produced-by edges.",
    d: "Nodes are artifact versions, runs and registry versions; edges say that a run read an artifact or wrote one. The graph is built from the input and output declarations recorded at run time, and stored in the metadata database or a graph store. It supports traversals both ways. Because edges come from what code declared, completeness is a data-quality problem. The graph must handle cycles in iterative workflows and keep edges when nodes are deleted.",
    k: ["Relational tables with recursive queries versus a dedicated graph store: tables keep one system and make deep traversals expensive; a graph store traverses fast and adds another system to run.", "Keep edges after deleting nodes versus remove them: keeping edges preserves the audit trail with dangling references; removal is tidy and breaks provenance."],
    p: ["A step that reads data without declaring it leaves a gap, and impact analysis reports no affected models.", "Edges are recorded between runs, not artifact versions, and the graph can say which run but not which output was used."],
    v: "Build a chain of dataset, preprocessing run, training run and registered version. Traversal from the version reaches the raw dataset in three hops, and from the dataset reaches the version.",
    dep: ["input-output-edges", "metadata-database", "artifact-versions-and-aliases"]
  },
  "input-output-edges": {
    s: "The records stating which artifacts a run consumed and which it produced, written during the run and used to build the lineage graph.",
    d: "When code logs an artifact it creates an output edge, and when code requests one it creates an input edge with the version actually resolved. The client writes edges as the calls happen, so they reflect real execution and not a plan. Edges also record role, such as train split or pretrained weights. The difficulty is coverage: data read through paths other than the tracker's API produce no edge, so conventions or wrapping of file access are needed.",
    k: ["Edges from API calls versus inferred from file access: API calls are explicit and miss unregistered reads; file-access inference catches more and is brittle and noisy.", "Edge written when requested versus when used: at request is simple and records data never actually read; at use is accurate and harder to detect."],
    p: ["An artifact downloaded and cached by an earlier run is read from the cache with no new edge.", "Role information is omitted and train and test inputs cannot be told apart."],
    v: "Run a job that consumes two artifacts and produces one, then list the run's edges. Exactly those three appear, with resolved versions and roles, and an artifact the code never requested is not listed.",
    dep: ["artifact-versions-and-aliases", "run-identity", "tracking-api"]
  },
  "pipeline-lineage": {
    s: "Lineage across the stages that precede and follow training: feature computation, data preparation, evaluation and deployment, linked into one end-to-end graph.",
    d: "Lineage inside the tracker covers runs and artifacts it saw. Real systems add feature definitions, data transformations in other systems and downstream serving. The tracker imports or links to these through shared identifiers, standard lineage events or references from pipeline hooks. This lets a question such as which models use this feature be answered. Cross-system lineage depends on every system emitting events with compatible identifiers.",
    k: ["Import external lineage into the tracker versus query it at read time: import gives fast, unified queries and duplicates data that may lag; read-time queries are fresh and slower and depend on availability.", "Standard event format versus custom connectors: a standard needs all systems to adopt it; connectors work now and multiply."],
    p: ["A feature is renamed upstream and the link to models using it disappears silently.", "Two systems identify the same dataset differently and the graph shows two unrelated nodes."],
    v: "Change a feature definition in the upstream system and query the tracker for models trained on it. The returned list equals the models whose runs consumed the feature set version before the change.",
    dep: ["lineage-graph", "pipeline-hooks", "dataset-version-links"]
  },
  "dependency-capture": {
    s: "Recording the exact software libraries, system packages and container image a run used, so the environment can be rebuilt.",
    d: "The client reads the installed package list with exact versions and, where available, the digest of the container image the job ran in, and saves a lock file. For models, a subset of dependencies needed to load the model is written into the package. The record supports both reconstruction and vulnerability scanning of what is deployed. Package names alone are not enough: native libraries, driver versions and compiler flags change results too.",
    k: ["Capture the full installed list versus declared direct dependencies: full lists are exact and noisy; direct dependencies are readable and miss transitive version changes.", "Record the container image digest versus a tag: a digest names exact contents; a tag is readable and can move to different contents."],
    p: ["A tag such as latest is recorded and later points to a different image.", "Packages are recorded but the accelerator driver and math library versions, which affect numerics, are not."],
    v: "Take a run's recorded dependencies and image digest, rebuild the environment from them on a clean machine, and confirm every listed package version and the digest match what is installed.",
    dep: ["environment-capture", "model-packaging"]
  },
  "downstream-impact": {
    s: "Finding everything affected when an input turns out to be wrong: models trained on a flawed dataset, deployments of those models and the decisions they fed.",
    d: "The analysis starts from a dataset version, a code commit, or a library release and follows lineage forward to runs, model versions, aliases and deployments. It reports what is live, who owns it and when it was last changed. Typical triggers are a labeling error, a leak, a license problem or a vulnerable library. It turns lineage from documentation into a tool for incident response. Its answer is an underestimate whenever lineage has gaps.",
    k: ["Precompute impact sets versus traverse on demand: precomputed sets answer instantly and need maintenance as the graph changes; on-demand traversal is always current and slower for deep graphs.", "Report only deployed models versus all derived models: deployed-only focuses action and misses candidates about to be promoted."],
    p: ["A dataset is fixed and impact analysis is trusted, but models trained on a copy made outside the tracker are missed.", "The report lists versions but not which alias currently serves them, so urgency is unclear."],
    v: "Mark a dataset version as defective. The report lists every version trained from it, directly or through intermediate datasets, with live aliases and owners, and matches a manual trace on a small known graph.",
    dep: ["lineage-graph", "lineage-queries", "stages-and-aliases", "deployment-connectors"]
  },
  "lineage-queries": {
    s: "The query operations over lineage: upstream and downstream traversal, path between two nodes, and filtered views such as all datasets feeding a model.",
    d: "The API takes a start node, a direction, a depth limit and optional filters on node types, and returns nodes and edges. Responses are paged because a popular dataset can reach thousands of models. The interface draws the result as a graph with expandable nodes. Access control applies per node, so a user may see that a hidden node exists without its contents. Deep traversals on a relational store need depth limits to stay fast.",
    k: ["Depth-limited traversal versus complete closure: limits keep response times bounded and may stop short of the root; full closure is complete and unbounded in cost.", "Show restricted nodes as placeholders versus omit them: placeholders keep paths understandable and reveal that something exists; omission hides everything and splits the graph."],
    p: ["An unbounded upstream query on a heavily reused dataset times out and takes the database with it.", "A cycle in an iterative workflow sends the traversal into an infinite loop."],
    v: "Query upstream from a model version with depth 10 on a graph containing a cycle. The call returns in bounded time with each node once, and a user lacking access sees placeholders for restricted nodes.",
    dep: ["lineage-graph", "metadata-database", "authorization-and-roles"]
  },
  "seed-capture": {
    s: "Recording random seeds and determinism settings used by the training code, so random choices such as initialization and shuffling can be repeated.",
    d: "Training code seeds several generators: the language's, numeric libraries', framework's and per-worker ones. The tracker records every seed as a parameter and the flags that force deterministic algorithms. Some operations are nondeterministic on accelerators unless explicitly constrained, and constraining them can cost speed. Recording what was and was not controlled tells a later reader how close a rerun can be expected to get.",
    k: ["Force full determinism versus accept statistical equivalence: determinism gives bit-identical reruns and slows training; accepting noise is fast and needs several seeds to judge results.", "Fixed seed in the code versus seed logged per run: a fixed seed hides variance and lets one lucky seed look like improvement; per-run seeds measure variability."],
    p: ["A seed is logged but one data-loading worker is seeded from the clock, so the order differs on rerun.", "A single run with one seed is reported as better than baseline within seed-to-seed noise."],
    v: "Rerun a job with the recorded seed and determinism flags on the same hardware. The loss series matches the original exactly, or the report names which operations were left nondeterministic.",
    dep: ["parameter-logging", "environment-capture"]
  },
  "config-snapshots": {
    s: "Storing the full resolved configuration of a run, after defaults, overrides and command-line arguments are merged, as one frozen document.",
    d: "Configuration comes from files, defaults in code, environment variables and flags, and the effective result is often not written anywhere. The snapshot captures that merged tree at run start and stores it as a file and as searchable parameters. It also records which files and overrides contributed. With it, a rerun uses exactly the same settings, and comparisons can diff two trees. It must capture config computed at runtime, not just what was on disk.",
    k: ["Snapshot the resolved configuration versus the input files: resolved settings are exact and hide where values came from; input files show intent and miss defaults added later by code changes.", "Store as one document versus flattened parameters: a document preserves structure and is hard to query; flattened keys query easily and lose list and tree shape."],
    p: ["Defaults baked into code change in a later commit and the stored input config no longer produces the same run.", "A value derived at runtime from hardware, like batch size per device, is absent from the snapshot."],
    v: "Start a run with overrides from three sources. The stored snapshot contains the final value of every setting, and launching a new run from the snapshot alone gives an identical resolved configuration.",
    dep: ["parameter-logging", "code-version-capture", "run-identity"]
  },
  "data-snapshot-pinning": {
    s: "Ensuring a run reads an immutable, identified snapshot of its data, so the same rows can be read again later.",
    d: "Rather than reading a live table or folder, the job resolves a snapshot identifier first, then reads that snapshot, and the identifier is recorded in the run. Snapshots can be copy-on-write table versions, content-addressed file sets or timestamps with time travel. Pinning also applies to evaluation sets, so scores stay comparable across versions. The cost is storage for retained snapshots and the requirement that the data system supports them.",
    k: ["Pin an immutable snapshot versus record a query and timestamp: snapshots are exact and cost storage; a query and time is cheap and breaks when rows are deleted or rewritten.", "Pin at job start versus per epoch: start-time pinning keeps a run consistent; per-epoch refresh follows streaming data and cannot be reproduced."],
    p: ["Retention removes an old snapshot, and the recorded identifier points to nothing.", "Preprocessing reads reference data from a mutable path outside the pinned snapshot."],
    v: "Pin a snapshot, modify and delete rows in the live data, then read the snapshot by its recorded identifier. The contents and row checksum equal what the original run saw.",
    dep: ["dataset-version-links", "external-references", "retention-policies"]
  },
  "environment-reconstruction": {
    s: "Rebuilding the software environment of a past run from its recorded dependencies, image and configuration, in a clean place.",
    d: "A reconstruction tool reads the run's lock file, container digest and system details, builds or pulls the same environment and starts a shell or job in it. It reports what could not be restored, such as a package removed from its index or a driver version unavailable on the current hardware. The older the run, the more of the record points at things that no longer exist, so archiving the built image is more reliable than archiving the recipe.",
    k: ["Rebuild from the recipe versus archive the built image: recipes are small and fail as upstream packages vanish; archived images always run and cost storage and carry old vulnerabilities.", "Strict match versus best effort with warnings: strict match gives trustworthy reruns and fails often; best effort usually runs and may differ silently."],
    p: ["A pinned package version has been withdrawn from its index, and the build fails years later.", "Reconstruction succeeds with a newer driver and results differ slightly without any warning."],
    v: "Pick a run from six months ago, reconstruct its environment on a clean machine, and run its recorded import check. The tool lists each restored component and clearly marks any it substituted.",
    dep: ["dependency-capture", "environment-capture", "hardware-record"]
  },
  "hardware-record": {
    s: "Recording the hardware and topology a run used: accelerator models, counts, interconnect, memory, and the number and layout of machines.",
    d: "The client reads device information at start and the platform adds allocation details. Hardware affects speed, memory limits, numerical behavior and the settings that were sensible, such as batch size and parallelism. Cost accounting uses the same data. For distributed jobs the topology says how processes were arranged across machines. Comparisons of run time between experiments are meaningless without it, and some results differ between device generations.",
    k: ["Record device models only versus also topology and interconnect: device models are easy and enough for single machines; topology explains scaling and needs the platform's cooperation.", "Record requested resources versus observed: requested shows intent, observed shows what the job truly had, which differs after preemption or failover."],
    p: ["A job requested eight devices but ran on four after a failure, and the record shows eight.", "Throughput numbers are compared between runs on different hardware without noticing."],
    v: "Run on a node with a known device model and count. The record names them exactly, and a job run on different hardware shows a different record, so a comparison view flags the difference.",
    dep: ["environment-capture", "training-platform-bridge"]
  },
  "rerun-from-record": {
    s: "Starting a new run from a past run's recorded code, configuration, data snapshot and environment, with one command or button.",
    d: "The tool checks out the recorded commit, applies any stored patch, restores the environment, pins the data snapshot, loads the configuration and launches the job, linking the new run to the original as a reproduction. It allows overrides for variations. It is the practical test of whether the record is sufficient: runs that cannot be re-launched reveal what the capture missed. Costs and permissions matter, since a rerun may need the same large resources.",
    k: ["One-click full rerun versus a prepared workspace for the user to start: one click is convenient and spends resources unasked; a prepared workspace gives control and requires steps.", "Link the rerun as a child of the original versus an independent run: linking keeps the reproduction relationship clear and can clutter the original's page."],
    p: ["The rerun silently substitutes a newer dataset when the pinned snapshot is gone.", "A rerun with stale credentials fails after consuming expensive resources."],
    v: "Trigger a rerun of a recorded run on the same hardware class. The new run is linked to the original, resolves the same commit, data snapshot and image digest, and reports differences between the two runs' final metrics.",
    dep: ["code-version-capture", "config-snapshots", "data-snapshot-pinning", "environment-reconstruction", "training-platform-bridge"]
  },
  "reproducibility-check": {
    s: "A scheduled or on-demand test that reruns selected recorded runs and compares results to the originals, to find where the record falls short.",
    d: "A sample of runs, often those behind registered models, is rerun from record. A comparison checks final metrics within a tolerance, and optionally the full curve. Failures are classified: missing input, environment mismatch, nondeterminism within noise, or real divergence. The report shows which capture fields were absent when a rerun failed. Running this continuously keeps the record honest, since otherwise gaps only appear when someone needs the record badly.",
    k: ["Exact match versus tolerance-based: exact match is strict and only valid with full determinism; tolerance suits normal training and needs a justified threshold.", "Check every run versus a sample: every run is thorough and expensive; sampling catches systematic gaps cheaply and misses isolated ones."],
    p: ["The tolerance is set so wide that anything passes, and the check certifies nothing.", "Checks use current hardware and report failures that are only a changed device generation."],
    v: "Seed a known gap, such as removing the data snapshot link from one run, then run the check. That run fails with the cause classified as missing data input, and a complete run passes within tolerance.",
    dep: ["rerun-from-record", "evaluation-reports", "seed-capture"]
  },
});
