// Details part 7: state; backends and locking; cross-cutting concerns.
ATLAS.details("infrastructure-as-code", {
  "state-file-format": {
    s: "The serialized document holding the tool's record of managed objects, written as structured text with a format version, a serial counter and a lineage identifier.",
    d: "The state is one document containing a format version, the tool version that wrote it, a serial that increases on every write, a lineage that identifies the history it belongs to, outputs and a list of resources with their instances. Writes are whole-document replacements. The lineage prevents mixing states of different origins, and the serial orders versions so a backend can reject an older write. Because the file is the record of truth and is human readable, people edit it, and that is both its convenience and its main hazard.",
    k: ["A single whole-document state versus per-resource records: a single document is simple to lock, copy and back up, but scales poorly and serializes all writers.", "Human-readable text versus an opaque binary: readable state eases debugging and recovery, while binary is compact and discourages editing."],
    p: ["A hand edit that leaves the serial unchanged is rejected or silently overwritten by the backend.", "Copying state between workspaces carries its lineage, and the tool then refuses to treat them as the same history."],
    v: "Open a state document and confirm it has a format version, serial, lineage and resources list; apply a change and confirm the serial increased by exactly one and the lineage is unchanged.",
    dep: ["state-schema","resource-instance-records"]
  },
  "state-schema": {
    s: "The defined structure of the state document: which fields exist, their types, and how outputs, modules, resources and instances are addressed and nested within it.",
    d: "State has top-level metadata, a map of output values with their types and sensitivity, and an array of resource entries. Each resource has a mode of managed or data, type, name, module path, provider configuration address and instances. Instance keys are indices or strings depending on how the resource expands. Attribute values are stored as objects in the provider's schema shape, alongside the schema version. Other tools read it, so field names are effectively a public interface. It is hard to evolve: any addition must remain readable by older tooling or force a format version bump.",
    k: ["Store attributes as one generic object per instance versus typed columns: a generic object works for any provider, but gives no help to consumers reading it.", "A public documented schema versus an internal one: a public schema supports external tools, but freezes decisions."],
    p: ["Third-party tools that read state directly break when a new format version moves a field.", "Removing a field from the schema loses data that older tool versions still need to read."],
    v: "Parse a state file with an independent reader following the documented schema, and confirm it extracts every resource address, instance key and provider reference identical to the tool's own listing.",
    dep: ["state-file-format","provider-schemas"]
  },
  "resource-instance-records": {
    s: "The per-instance entries in state: the object's attributes as last known, its identifier, dependencies, schema version, provider configuration and a status such as tainted.",
    d: "Each instance stores the attribute values the provider last returned, a list of dependency addresses recorded when it was applied, the schema version for upgrades, the provider configuration address that owns it and flags such as tainted or deposed. Deposed entries hold the old objects of an interrupted replacement, so they can be destroyed later. The recorded dependencies let destroy order objects whose configuration is gone. Hard parts are staleness and trust: the record may differ from reality until refreshed.",
    k: ["Record dependencies in state versus recompute from configuration: stored dependencies enable destroy after configuration is deleted, but can go stale.", "Keep deposed objects as separate entries versus delete immediately: deposed entries protect against loss on interruption, but must be cleaned up."],
    p: ["Stored dependency lists that are out of date make destroy order wrong, and a dependent is deleted after its parent.", "An instance marked as tainted by a failed provisioner is replaced next apply even when nothing else changed."],
    v: "Interrupt a create-before-destroy replacement and inspect state for a deposed entry; then rerun apply and confirm the deposed object is destroyed and its entry removed.",
    dep: ["state-schema","state-manager"]
  },
  "state-manager": {
    s: "The internal interface through which the engine reads, updates and persists state, keeping an in-memory working copy and writing snapshots to the backend at safe points.",
    d: "During a run the manager holds a working state, updated under a mutex whenever a node finishes, and a persisted snapshot written to the backend periodically and at the end. Plan operations work on a copy of state refreshed from providers. On apply it writes after each resource completes, by default, so progress survives crashes. It verifies serial and lineage before writing. It must serialize concurrent updates from parallel workers into one coherent document, and decide how often to persist, trading durability against backend load.",
    k: ["Persist after each resource versus only at the end: frequent writes limit loss from a crash, but multiply backend calls and run time.", "Working copy in memory versus read-modify-write each time: a working copy is fast and consistent in a run, but loses unpersisted work if the process dies."],
    p: ["A crash between provider success and the next snapshot write leaves a real object missing from state.", "Slow remote backends make per-resource persistence the dominant cost of a large apply."],
    v: "Kill the process during an apply of many resources and confirm the persisted state contains all resources completed before the kill, with a serial that reflects the number of snapshots written.",
    dep: ["state-file-format","backend-abstraction","state-snapshots"]
  },
  "state-snapshots": {
    s: "Versioned copies of state kept by each write or by the backend, enabling history, comparison and rollback to an earlier known serial.",
    d: "Each persisted state has a serial and a lineage, and many backends keep every version, either through object versioning or by their own history. Local operations write a backup before commands that edit state. Service backends keep a list of versions with the run that created each. Snapshots allow recovery from a bad apply or a mistaken edit, and audit of what changed. Rollback restores state only, not infrastructure, so the real world and the restored record can disagree. Retention rules matter because every snapshot may hold secrets.",
    k: ["Keep every version versus a limited window: full history helps forensics and rollback, but multiplies stored secrets and cost.", "Rolling back state versus fixing forward with a new apply: rollback is quick for a corrupted record, but leaves infrastructure unchanged and inconsistent."],
    p: ["Rolling back state after a successful apply makes the next plan try to create objects that already exist.", "Old snapshots with plaintext secrets outlive a rotation that was assumed to have removed them."],
    v: "Apply two changes, list versions and confirm two new serials with distinct run references, then restore the earlier snapshot and confirm plan describes re-applying the later change.",
    dep: ["state-file-format","backend-abstraction"]
  },
  "state-upgrade": {
    s: "Automatic and explicit conversion of state written by older tool or provider versions into the current format, with refusal to open state from a newer version.",
    d: "State records the format version and the tool version that last wrote it. A newer core reads older formats and rewrites them on the next save. A core refuses state written by a newer version than it understands, to avoid dropping fields. Provider schema upgrades run alongside, in memory, via upgraders. Migrations run implicitly during ordinary commands, so the first command after an upgrade writes a changed state. The hard part is one-way movement: once state is upgraded, older tool versions in other pipelines can no longer use it.",
    k: ["Silent upgrade on first write versus an explicit migration step: silent upgrades are easy, but surprise teams that still run older versions elsewhere.", "Refuse newer state versus attempt to read it: refusing prevents data loss, but can block an emergency downgrade."],
    p: ["One engineer upgrades the tool locally and applies, and every pipeline on the old version then fails on the state.", "Skipping several major versions at once forces a chain of upgrades that is not tested in that combination."],
    v: "Open state written by an older format version with the current tool, run plan and confirm it reads, apply a no-op, and confirm the stored format version is updated and the older tool now refuses it.",
    dep: ["state-file-format","schema-upgraders","state-manager"]
  },
  "secrets-in-state": {
    s: "The fact that state stores every attribute the provider returns in plain form, including passwords and keys, so state access equals secret access.",
    d: "Providers return full attribute values, and the tool stores them so it can diff on later runs. Sensitivity marks affect display only, not storage. Database passwords, generated keys and tokens appear in state, plan files and sometimes outputs. Anyone who can read state can read them, and so can any system that copies it, such as backups and logs. Mitigations are encryption at rest, strict access control, write-only attributes and ephemeral values, and fetching secrets outside the tool. It is hard because it is inherent to the design.",
    k: ["Store full values versus store hashes of secrets: full values allow accurate diffs, while hashes would hide secrets but break providers that need them.", "Generate secrets in the tool versus reference an external secret store: generated secrets are convenient, but permanently live in state."],
    p: ["State shared with a broad group for reading outputs also gives them every database password.", "A secret rotated in a vault stays in old snapshots indefinitely."],
    v: "Create a resource with a generated password, search the state document and the saved plan for it, and confirm where it appears; then repeat with a write-only argument and confirm it is absent.",
    dep: ["state-file-format","sensitive-values","ephemeral-resources","state-encryption"]
  },
  "state-encryption": {
    s: "Encrypting state and plan files at rest with keys the operator controls, either by the tool before upload or by the backend's storage layer.",
    d: "Two layers exist. Storage-level encryption, managed by the backend or object store, protects against disk and snapshot theft but not against anyone with read permission. Tool-level encryption wraps the state document with a key from a key service or passphrase before writing, and unwraps after reading, so the backend only sees ciphertext. Key rotation needs a fallback to read old data while writing new. It is hard because losing the key loses the state, and encrypting changes how other tools can read it.",
    k: ["Tool-level encryption versus storage-level only: tool-level hides data from the backend operator, but couples recovery to key management.", "Key from a managed service versus a passphrase: a service gives rotation and access control, while a passphrase works anywhere but is easily mishandled."],
    p: ["Loss of the encryption key makes state permanently unreadable, and the real infrastructure must be reimported.", "Encrypting state but not plan files leaves the same secrets in pipeline artifacts."],
    v: "Enable encryption, apply, read the stored object directly from the backend and confirm it is not readable text, then confirm the tool reads it back and a rotated key still opens older versions.",
    dep: ["secrets-in-state","state-file-format","remote-object-backend"]
  },
  "backend-abstraction": {
    s: "The interface that hides where state is stored, defining operations to read, write, lock, list workspaces and delete, so every command works with any storage type.",
    d: "A backend implements methods to fetch the current state, persist a new one, take and release a lock, and enumerate and manage named states. The engine uses only this interface. Some backends add remote operations, running plans on a service. The backend is chosen in configuration, and its settings are cached in the local data directory at initialization. A change of backend configuration is detected and triggers a migration prompt. It is hard because storage systems differ in consistency and locking guarantees, and the interface hides those differences.",
    k: ["A narrow read-write-lock interface versus rich per-backend features: a narrow interface keeps backends simple, but advanced features need ad hoc extensions.", "Backend settings in configuration versus partial configuration at initialization: in-file settings are reviewable, while partial settings keep secrets and paths out."],
    p: ["A backend whose storage is only eventually consistent can return an older state right after a write.", "Credentials embedded in backend configuration are cached in the local data directory and committed by accident."],
    v: "Run the same plan and apply against two different backend types and confirm identical results, with state, serial and locking behavior consistent through the same commands.",
    dep: ["state-file-format","state-locking"]
  },
  "local-backend": {
    s: "The default backend storing state in a file on the local disk, with a lock file, suitable for individual use and experiments.",
    d: "The state is a file in the working directory or a configured path, written atomically with a backup of the previous version. Locking uses operating system file locks, effective only on one machine. Workspaces are directories. It needs no setup and works offline. Everything that makes it simple also makes it unsafe for teams: no shared access, no history beyond a backup, no protection against two people running at once, and secrets sit in plaintext on disk and are easy to commit to version control.",
    k: ["Local file versus a shared backend from the start: local needs no setup, but migrating later involves moving state under a lock.", "Backup on every write versus none: backups protect against interrupted writes, but leave extra plaintext copies of secrets."],
    p: ["State committed to version control exposes secrets and conflicts on merge.", "Two people applying from separate checkouts each hold their own state and duplicate resources."],
    v: "Apply in an empty directory and confirm a state file and a backup appear; start a second run during the first and confirm it fails on the lock, then confirm it succeeds after the first ends.",
    dep: ["backend-abstraction","state-file-format"]
  },
  "remote-object-backend": {
    s: "A backend storing state as an object in shared storage, with versioning and encryption supplied by the storage system and a separate mechanism for locking.",
    d: "State is written as one object per workspace to a bucket or container, using credentials of the runner. Object versioning provides history. Some stores support conditional writes that make a lock a simple object; others need an additional table or service to hold lock records. Reads can be eventually consistent in some systems, which is why backends verify checksums. Access policy on the storage becomes state security. It is hard because storage permissions, lock storage and encryption are configured separately and must be set up before first use.",
    k: ["Object storage with conditional-write locks versus a separate lock service: conditional writes need no extra service, while a separate service works with stores lacking them.", "One bucket for all state versus one per environment: one bucket is simpler, while per-environment buckets limit access and damage."],
    p: ["A missing lock table or permission lets applies run with no lock, and the first collision corrupts state.", "A bucket without versioning makes an overwritten state unrecoverable."],
    v: "Initialize against a bucket with versioning, apply twice and list object versions to confirm two versions exist, and confirm a second concurrent run is refused with the lock holder's identity shown.",
    dep: ["backend-abstraction","state-locking","state-snapshots","state-encryption"]
  },
  "state-locking": {
    s: "Mutual exclusion that stops two operations from modifying the same state at once, held for the duration of each plan or apply that writes.",
    d: "Before an operation that may write state, the engine asks the backend for a lock, recording an identifier, who and when. If already held, the run waits for a timeout or fails with the holder's details. The lock is released at the end and by cleanup on interrupts. Locks protect the read-modify-write cycle, since two runs reading the same serial and both writing would lose one change. Implementation depends on the backend: file locks, conditional object writes, database rows or a service. Failure modes are stale locks left by crashes and backends that cannot lock.",
    k: ["Lock for the whole run versus per write: whole-run locks give simple safety, but block other users for long applies.", "Fail immediately versus wait with a timeout: failing is clear, while waiting smooths short collisions but hides contention."],
    p: ["A runner killed mid-apply leaves a lock held, and every later run fails until someone force-releases it.", "Plans that skip the lock to be fast read state during an apply and show a misleading diff."],
    v: "Start an apply that pauses, run a second apply and confirm it reports the lock holder, ID and time and makes no changes; then finish the first and confirm the second succeeds.",
    dep: ["backend-abstraction","lock-recovery"]
  },
  "lock-recovery": {
    s: "The procedure and command for releasing a lock left behind by a crashed or killed run, safely and only after confirming nothing is still writing.",
    d: "A forced unlock takes the lock identifier shown in the error and tells the backend to delete it, without confirming that the holder is gone. Before doing so, an operator checks whether the holder's process or pipeline is still running, and whether state is consistent. Managed services detect abandoned runs by timeouts and can cancel them. If the interrupted run was mid-write, state may be missing recent changes, and a refresh and import may be needed. The risk is simple: unlocking a lock that is live allows two writers.",
    k: ["Manual force-unlock versus automatic expiry by timeout: manual keeps a human in the loop, while expiry recovers quickly but may break a long run.", "Require the lock identifier to unlock versus allow any unlock: requiring the identifier prevents releasing the wrong lock, but needs the original error text."],
    p: ["Forcing an unlock while a slow apply is still running lets a second apply overwrite its state.", "After a crash, objects created before the lock was lost are not in state and are duplicated on rerun."],
    v: "Kill a run mid-apply, confirm the lock remains and shows its ID, force-unlock with that ID after confirming the process is gone, and confirm the next plan reflects the objects actually created.",
    dep: ["state-locking","partial-failure"]
  },
  "remote-state-reader": {
    s: "A data source that reads another configuration's outputs from its state, letting stacks share values such as network identifiers without duplicating them.",
    d: "The data source is configured with a backend type and settings and fetches the other state, then exposes its root outputs. It needs read permission on that whole state, since the backend has no per-output permissions, so it grants access to everything stored there, including secrets. The result is read at plan time and is not versioned, so the consumer sees whatever the producer last applied. Alternatives are publishing values to a parameter store or registering them with a service that exposes only outputs.",
    k: ["Read state directly versus a dedicated output-sharing service: direct reads need no extra system, but expose the entire state.", "Share via outputs versus lookup by data source: outputs are explicit and versioned together, while lookups avoid coupling the two stacks."],
    p: ["Granting a team read on another stack's state to get one output also gives it every secret in that state.", "Renaming an output in the producer breaks every consumer at its next plan."],
    v: "Publish an output in one stack, read it with the data source from another, change the output, apply the producer, and confirm the consumer's next plan shows the new value.",
    dep: ["backend-abstraction","output-values","data-sources"]
  },
  "backend-migration": {
    s: "Moving state from one backend to another, or between workspaces, by copying the latest state under a lock and switching configuration to the new location.",
    d: "When backend configuration changes, the initialization step detects it and offers to copy existing state to the new backend. The tool locks both, copies each workspace, verifies the serial and lineage, and updates the cached backend settings. It can also be done manually by pulling state and pushing it. Migrations must happen while no one else is applying. The hard part is coordination: every other user and pipeline must switch to the new settings at the same time, or someone writes to the old location.",
    k: ["Tool-assisted copy versus manual pull and push: assisted copy checks lineage and locks, while manual gives control for unusual layouts.", "Migrate all workspaces at once versus one at a time: all at once is consistent, while one at a time limits the effect of a failure."],
    p: ["A pipeline still configured for the old backend keeps writing to a state nobody reads, and the two diverge.", "Copying state into a backend with an existing different lineage overwrites its history."],
    v: "Migrate a state to a new backend, confirm serial and lineage match, run plan against the new backend and confirm no changes, and confirm the old location is no longer written.",
    dep: ["backend-abstraction","state-locking","state-snapshots"]
  },
  "state-as-source-of-truth": {
    s: "The decision that the tool plans against its own record of what it created, not against a scan of the world, and the consequences for trust, drift and recovery.",
    d: "Every plan starts from state: objects in state but not in configuration are destroyed, and those in configuration but not in state are created. The alternative, discovering objects by tags or names, is slower and ambiguous. Keeping a record makes identity precise and diffs fast, but the record can be wrong: after a crash, a manual change or a bad edit, the tool acts on a false picture. Much of the architecture, including refresh, locking, snapshots, import and encryption, exists to keep that record correct and safe.",
    k: ["Own record versus discovery by scanning: a record gives exact identity and speed, but can drift and must be protected.", "Refresh every time versus trust the record: refreshing keeps plans honest, but costs time and API quota."],
    p: ["A lost or corrupted state makes the tool believe nothing exists and plan to create duplicates of everything.", "Teams treat state as an implementation detail and give broad write access to it."],
    v: "Delete one object by hand and one state entry by hand in a sandbox, run plan, and confirm the first is planned for recreation and the second for a duplicate creation, matching the stated model.",
    dep: ["state-file-format","refresh-and-drift","state-locking"]
  },
  "idempotence-and-convergence": {
    s: "The property that applying the same configuration twice changes nothing the second time, and that repeated runs move the real world toward the declared one.",
    d: "A well-behaved run ends with a plan showing no changes. This depends on every layer: providers must return the same normalized values they were given, expressions must be deterministic, and the engine must compare like with like. Perpetual diffs break the property and train people to ignore plans. Convergence also covers failure: after a partial apply, rerunning should finish the work, not duplicate it. Non-idempotent pieces, such as provisioners, timestamps and randomness, are the usual culprits.",
    k: ["Strict no-change plans as a quality gate versus tolerating known noise: a strict gate catches provider bugs, but forces ignore rules to silence harmless churn.", "Declarative reconciliation versus replaying a recorded script: reconciliation recovers from any state, but needs every provider to compute diffs correctly."],
    p: ["A provider that normalizes a value differently from configuration produces a diff on every plan, so real changes drown in noise.", "Time or random functions in arguments change on each run and make the plan never settle."],
    v: "Apply a configuration, immediately plan again, and confirm zero changes with exit status indicating none; repeat after an interrupted apply and confirm the rerun completes the remainder.",
    dep: ["plan-diff","provider-lifecycle-calls","apply-consistency-check"]
  },
  "blast-radius": {
    s: "How much one run can change or destroy at once, shaped by how configurations are split into states, how permissions are scoped and what gates a destructive plan.",
    d: "One state with everything in it means any change can touch any object, and one mistake can destroy an environment. Splitting into many small states, by layer, environment and team, limits what a single plan can reach and shortens plans, but adds cross-state references and ordering between runs. Other levers are scoped credentials, protected resources, approvals on destroy, policy that blocks deletions and plan summaries that make deletes visible. It must be decided early, since splitting later means moving state.",
    k: ["Few large states versus many small states: large states make cross references simple, while small ones contain mistakes and run faster.", "Strong gates on destroy versus fast unattended applies: gates prevent disasters, but add friction to routine changes."],
    p: ["A single state for a whole company means any plan can delete anything, and plans take an hour to refresh.", "Splitting states without ordering leaves consumers applied before producers."],
    v: "Make a mistaken change that would delete a database in a sandbox and confirm that scoped credentials, protection or policy stop it at some layer, and that the plan only touches one state.",
    dep: ["workspaces","access-control","policy-as-code","lifecycle-rules"]
  },
  "secrets-handling": {
    s: "How credentials and sensitive values enter, move through and leave the tool, across configuration, plans, logs, state and run services.",
    d: "Secrets arrive as provider credentials, variables and values read from stores; they pass through expressions, providers and processes; and they can end up in state, plan files, logs, outputs and artifacts. Controls differ by layer: sensitivity marks for display, ephemeral values for non-persistence, encryption for storage, scoped identity for provider access and access control for state. No single control covers every path, so the question must be asked at each hop. The tool treats display protection as best effort.",
    k: ["Prevent secrets from persisting versus protect them where they persist: prevention is stronger, but needs support from providers.", "Central credentials in a run service versus credentials at each developer: central storage reduces spread, but concentrates risk."],
    p: ["A secret protected in plan output is printed in full by a provisioner's command line or a debug log.", "Pipeline artifacts containing plan files are readable by anyone with project access."],
    v: "Run a plan and apply with a known fake secret in a sandbox, then search logs, state, plan file, outputs and artifacts for the exact string, and confirm each location matches the documented behavior.",
    dep: ["sensitive-values","secrets-in-state","ephemeral-resources","credential-resolution","state-encryption"]
  },
  "compatibility-and-versioning": {
    s: "How tool, provider, protocol, state, plan and module versions stay compatible over years, and what breaks one-way when any of them is upgraded.",
    d: "Six formats evolve at different speeds: the core, provider releases, the plugin protocol, state and plan files, module interfaces, and the configuration language. Lockfiles pin providers; state and plan files record versions and refuse newer ones; schema versions and upgraders carry resource state forward; moved blocks carry renames. Upgrades are mostly one-way, so order matters: upgrade providers or tool first, in a branch, in a sandbox, then production. The hard part is that old pipelines and new ones overlap for a long time.",
    k: ["Long compatibility windows versus fast removal of old behavior: long windows ease upgrades, but multiply code paths and testing.", "Upgrade everything on a schedule versus on demand: scheduled upgrades keep jumps small, while on-demand upgrades defer risk until it is bigger."],
    p: ["Skipping several major versions at once combines their breaking changes and leaves no clean point to roll back to.", "Engineers on different tool versions each rewrite the state format, and pipelines on the older version break."],
    v: "Upgrade the tool, then each provider, one at a time in a sandbox copy of production state, and confirm each step produces only the documented plan changes and that rollback instructions work before the production upgrade.",
    dep: ["dependency-lockfile","state-upgrade","schema-upgraders","protocol-handshake","moved-blocks"]
  },
  "concurrency-and-ordering": {
    s: "How parallelism is managed at every level: runs per state, nodes per run, calls per provider and updates to shared state, all constrained by the dependency graph.",
    d: "Several kinds of concurrency interact. Across runs, locks allow one writer per state. Within a run, the graph permits parallel work up to a configured limit. Within a provider, calls are made concurrently and may hit rate limits. Within state, updates from parallel nodes are serialized into one document. Across states, ordering is manual: the producer must apply before the consumer. Dependencies define safe order inside a run; nothing defines it across runs except process and convention.",
    k: ["Fine-grained parallelism within a run versus sequential safety: parallelism makes large applies fast, but exposes rate limits and provider races.", "Orchestrated order across states versus manual order: orchestration prevents mistakes, but needs a service that models cross-state dependencies."],
    p: ["Parallel apply plus an unthrottled provider produces intermittent rate-limit failures that appear to be random.", "Dependent stacks applied in the wrong order read stale or missing outputs."],
    v: "Apply a wide graph with parallelism one and with the default, compare total time and ordering from logs, and confirm dependency order held in both runs and the state is identical.",
    dep: ["parallel-graph-walk","state-locking","concurrency-limit","graph-builder"]
  },
});
