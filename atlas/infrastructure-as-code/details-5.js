// Details part 5: apply engine; import and refactoring.
ATLAS.details("infrastructure-as-code", {
  "parallel-graph-walk": {
    s: "Executes the apply graph by running every node as soon as all its dependencies finish, concurrently up to a limit, and propagating failure to dependents.",
    d: "A walker keeps a set of ready nodes and runs each in its own worker. When a node completes, its dependents have one fewer unmet edge and may start. Nodes include resource instances, data reads, outputs and expansions, and a node's work is to evaluate its configuration with now-known values, call the provider and record the result in state. Errors mark dependents as skipped. The walk is also used for plan, validate and destroy with different node behaviors. The hard part is shared mutable state: every node reads and writes the same state and diagnostics.",
    k: ["Maximal parallelism versus sequential order: parallel walks finish far sooner on wide graphs, but make logs interleave and expose provider thread-safety bugs.", "Walk the same graph for every operation versus separate engines: sharing one walker reduces bugs, but forces each operation into the same node model."],
    p: ["Interleaved log lines from parallel nodes make a failed apply hard to read after the fact.", "A provider that rate-limits per account throttles under high parallelism and fails with errors unrelated to the change."],
    v: "Apply ten independent resources with a recorded delay each and confirm total time is close to the limit-adjusted delay, not ten times it, while a dependent resource starts only after its dependency completes.",
    dep: ["graph-builder","provider-lifecycle-calls","state-manager","concurrency-limit"]
  },
  "concurrency-limit": {
    s: "A configurable cap on how many graph nodes run at once, protecting provider APIs from rate limits and the machine from exhausting memory.",
    d: "A semaphore sized by a parallelism setting gates the walker; the default is modest, such as ten. Lowering it reduces API pressure; raising it speeds wide graphs. Each running node may hold a provider call open for minutes. The limit applies per run across all providers and does not account for different services' limits, so one slow service can hold slots while others wait. Providers may add their own retry and back-off. It is hard to choose because the right value depends on external quotas that the tool cannot see.",
    k: ["One global limit versus per-provider limits: a global limit is simple, while per-provider limits would match real quotas but need more configuration.", "Conservative default versus aggressive default: a low default avoids rate-limit failures, but makes large estates slow until tuned."],
    p: ["Raising parallelism to speed up a pipeline triggers rate limiting and turns a slow success into a flaky failure.", "Long-running nodes occupy all slots, blocking short independent work behind them."],
    v: "Apply twenty independent resources with the limit set to two and confirm from provider logs that no more than two calls were ever in flight at once.",
    dep: ["parallel-graph-walk"]
  },
  "partial-failure": {
    s: "How an apply behaves when some changes succeed and others fail: completed work is recorded, dependents are skipped, and the run ends with an error and a consistent state.",
    d: "When a node fails, the walker stops starting nodes that depend on it but lets independent nodes finish. Every successful change has been written to state immediately, so the record reflects reality. If a create fails after the object was partly made, the provider may return the partial object and the engine saves it marked as tainted, so it is replaced next time. A rerun of plan then shows the remaining work. The hard parts are crashes and interruptions, which can lose the last write, and providers that report failure after succeeding.",
    k: ["Continue independent work after a failure versus stop everything: continuing finishes more but leaves a larger partial state, while stopping is easier to reason about.", "Taint partially created objects versus leave them as normal: tainting forces replacement and a clean object, but destroys partly working ones."],
    p: ["A crash between the provider's success and the state write leaves a real object missing from state, which a later apply tries to create again.", "A timeout reported as failure while the remote operation continues leaves an orphaned object."],
    v: "Apply three resources where the second fails, confirm state lists the first and third, the failed one is tainted or absent as designed, and a following plan shows only the failed item and its dependents.",
    dep: ["parallel-graph-walk","state-manager","resource-instance-records"]
  },
  "create-before-destroy": {
    s: "A replacement order that builds the new object first and removes the old one afterward, avoiding downtime for objects that cannot briefly disappear.",
    d: "By default replacement destroys then creates. With create-before-destroy the plan creates the new instance while the old remains, repoints dependents, then destroys the old one. The graph reverses the destroy edges to implement this, and the setting propagates to dependencies, since they too must coexist. Both versions exist at once, so names and other unique attributes must differ, and the old object holds its quota. It is hard because uniqueness constraints often forbid coexistence, and failure midway leaves two objects.",
    k: ["Create first versus destroy first: creating first avoids downtime but needs unique names and spare quota; destroying first is simple but has a gap.", "Propagating the setting to dependencies versus not: propagation is required for correct ordering, but changes behavior of objects whose configuration never mentioned it."],
    p: ["A fixed name makes the new object collide with the old, so the create fails and the replacement stops halfway.", "The setting added to one resource unexpectedly changes the replacement order of resources it depends on."],
    v: "Force replacement of a resource with the setting enabled and a generated name, and confirm from the log that the create finished before the delete began and that dependents point at the new identifier.",
    dep: ["lifecycle-rules","graph-transforms","replace-vs-update"]
  },
  "lifecycle-rules": {
    s: "Per-resource settings that change default behavior: prevent destruction, ignore changes to named attributes, force replacement on triggers, and reverse replacement order.",
    d: "A lifecycle block can mark a resource as protected, so any plan that would destroy it fails; list attributes to ignore when diffing, so external changes there are not reverted; require replacement when another value changes; and set create-before-destroy. Rules are evaluated by the engine during planning and apply, not by providers. They encode operational knowledge, such as that autoscaling manages a count. The hazard is accumulation: ignored attributes hide real drift, and protection blocks legitimate cleanup.",
    k: ["Ignore specific attributes versus ignore all changes: narrow rules keep most drift visible, while broad rules are convenient and blind.", "Protection in configuration versus in the platform: in-configuration protection is easy but disappears when the block is removed, while platform protection holds regardless."],
    p: ["Protection is bypassed by deleting the resource block and applying, because the rule goes away with the block.", "An ignore rule added to silence one noisy diff hides a security-relevant change a year later."],
    v: "Mark a resource as protected, plan its removal and confirm the plan fails with the resource named; separately ignore one attribute, change it outside the tool and confirm the plan shows no diff.",
    dep: ["plan-diff","create-before-destroy","blocks-and-attributes"]
  },
  "apply-consistency-check": {
    s: "Verification that values returned by the provider during apply match the plan wherever the plan promised a known value, catching provider bugs before they corrupt state.",
    d: "At plan time each attribute is either known, with a value the provider committed to, or unknown. After apply the engine compares the result with the plan: any known value that changed is an error, and unknown values must now be known. The check applies to nested structures and sets, where matching elements is hard. A violation is reported as a provider bug, and the object is still stored so state stays truthful. It exists because dependents were planned using the promised values.",
    k: ["Treat inconsistency as an error versus tolerate it: errors surface provider bugs and protect dependents, but stop an apply that would otherwise mostly work.", "Strict check on every attribute versus only on referenced ones: strict is simple and catches more, while selective is faster but misses silent changes."],
    p: ["A provider that normalizes a value on create, such as case, trips the check and fails every apply of that resource.", "Set-typed attributes are compared by element identity, which produces false inconsistencies after reordering."],
    v: "Use a test provider that returns a different value than planned for a known attribute and confirm apply fails naming the attribute and both values, with the object still written to state.",
    dep: ["plan-diff","unknown-values","state-manager"]
  },
  "destroy-engine": {
    s: "Deletes all managed objects, or those removed from configuration, in the reverse of creation order, calling the provider's delete for each.",
    d: "Destroy builds a graph from state, reverses all edges so dependents are deleted before what they depend on, and walks it in parallel. Configuration is still evaluated, because provider configurations and provisioners may need values. Objects marked as protected cause the plan to fail. Deleting also runs destroy-time provisioners. The hard part is failure and leftover: if a parent cannot be deleted because something outside the tool uses it, the run stops, and partially destroyed state needs careful handling.",
    k: ["Destroy driven by state versus by configuration: state-driven destroy works even after configuration was removed, but needs provider configuration to still exist.", "Fail on the first undeletable object versus continue: stopping is safe and clear, while continuing frees more but leaves a messier remainder."],
    p: ["Deleting configuration and its provider block together makes the remaining objects impossible to destroy, since no provider can be configured.", "A dependency created outside the tool, such as a snapshot, blocks deletion with an error that names only the remote side."],
    v: "Destroy a configuration with a network and a dependent subnet, and confirm the log shows the subnet deleted first, state is empty afterward, and the remote objects are gone.",
    dep: ["graph-builder","parallel-graph-walk","provider-lifecycle-calls","lifecycle-rules"]
  },
  "provisioners": {
    s: "Last-resort hooks that run local or remote commands when a resource is created or destroyed, for setup actions the provider cannot express.",
    d: "A provisioner block on a resource runs a script locally or over a remote connection after create, or before destroy. It runs only on those events, not on later changes, so it cannot be reconciled with later configuration. Output is streamed to the log. If a creation provisioner fails, the resource is marked tainted. Because they run arbitrary commands and need network reachability, they are described as a last resort. The core reason is that the tool cannot track what a script did, so it can never plan or correct it.",
    k: ["Provisioners versus image-building or configuration management tools: provisioners keep everything in one run, but their effects are invisible to plans and state.", "Fail the resource on error versus ignore errors: failing makes problems visible, while ignoring keeps pipelines moving with half-configured hosts."],
    p: ["A provisioner script that is not idempotent leaves a host broken after a retry of a failed create.", "A remote connection to a host that is not yet reachable makes a creation hang until a long timeout."],
    v: "Attach a creation provisioner that writes a marker file, apply and confirm the file exists; make the script fail and confirm the resource is tainted and replaced on the next apply.",
    dep: ["partial-failure","parallel-graph-walk"]
  },
  "retries-and-timeouts": {
    s: "Per-operation time limits and automatic retry with back-off for transient provider errors, so slow or throttled calls resolve without failing the run.",
    d: "Resources can declare timeouts for create, update and delete, since some operations take minutes to hours. Providers retry on throttling and known transient errors, usually with exponential back-off and jitter, and poll for eventual consistency until a target status is reached. The engine itself does not retry nodes. A timeout fires an error but cannot cancel the remote operation, which may complete later. The difficulty is deciding between transient and permanent errors, and avoiding duplicate creation when a retry follows an operation that actually succeeded.",
    k: ["Retry inside the provider versus in the engine: provider-level retries know which errors are safe, but each provider implements them differently.", "Long default timeouts versus short ones: long ones tolerate slow services, but hide hung operations in pipelines."],
    p: ["A retry after an unacknowledged create makes a second object, because the first quietly succeeded.", "Timeouts shorter than the service's real duration cause failures followed by orphaned objects."],
    v: "Inject a throttling response on the first two calls of a test provider and confirm the third succeeds without failing the apply, with back-off delays visible in the log.",
    dep: ["provider-lifecycle-calls","partial-failure"]
  },
  "import-blocks": {
    s: "A declarative block that names an existing remote object and the resource address it should be adopted under, planned and applied like any other change.",
    d: "An import block gives a target address and an identifier, with optional per-instance expressions. During planning the engine reads the real object through the provider and shows it as imported, along with any differences from configuration. Applying records it in state without creating anything. Because the block is configuration, it is reviewable, can be run in pipelines and can import many instances with for-each. It is hard because the configuration must still match the real object's attributes, or the first plan after import proposes changes.",
    k: ["Declarative import versus a one-off command: declarative import is reviewed and repeatable, while commands are quick but mutate state outside review.", "Remove import blocks after use versus keep them: removing keeps configuration clean, while keeping them documents origin but adds noise."],
    p: ["Importing an object whose configuration differs from reality yields a plan that immediately changes the live object.", "Importing the same object under two addresses leads two resources to fight over one real object."],
    v: "Create an object outside the tool, add an import block and matching configuration, plan, apply, and confirm state holds it and a following plan shows no changes.",
    dep: ["import-id-resolution","plan-diff","resource-instance-records"]
  },
  "import-id-resolution": {
    s: "The provider-defined mapping from an identifier string, or identity attributes, to a real object, which is read to populate all of its attributes.",
    d: "Each resource type defines the format of its import identifier, which may be a name, a composite of several fields or a path. Newer schemas expose identity as structured attributes instead of one string. The provider's read-for-import call returns the full object, and the engine stores it. Importing needs the same credentials and provider configuration as normal runs. The difficulty is documentation and ambiguity: formats vary per type, and importing a resource whose children are separate resources needs each child imported separately.",
    k: ["Opaque identifier strings versus structured identity attributes: strings are simple, while structured identity is self-describing and validated.", "Import creates state only versus also writes configuration: state-only keeps scope small, but leaves authors to write matching configuration."],
    p: ["A wrongly formatted identifier fails with a message that names a remote lookup rather than the format.", "Child objects such as rules or attachments are not imported with the parent and remain unmanaged."],
    v: "Import one object by its documented identifier format, then show state and confirm every attribute the provider reports is populated and identical to a direct read.",
    dep: ["provider-lifecycle-calls","provider-schemas"]
  },
  "config-generation": {
    s: "A mode that writes draft configuration for imported objects from the attributes the provider read, so adoption does not start with a blank file.",
    d: "When an import block targets an address with no configuration, a flag asks the engine to generate it. The engine reads each object, takes its attributes, drops computed-only ones and writes a resource block with the rest as arguments. The output is meant as a draft: values are literal rather than references, defaults are repeated and secrets may be missing. A person then cleans it into modules and variables. The hard part is that schemas do not say which attributes are worth writing.",
    k: ["Generate a draft versus write by hand: generation is fast and complete, but produces verbose literal configuration.", "Include defaults versus omit them: including defaults guarantees no drift on first plan, but buries the meaningful arguments."],
    p: ["Generated configuration is committed unchanged, so every identifier is hardcoded and no relationships are expressed.", "Attributes that are write-only, such as passwords, cannot be generated, and the first plan wants to change them."],
    v: "Import an existing object with generation enabled, confirm a configuration file is written, and that planning it afterward shows no changes after removing or fixing any flagged attributes.",
    dep: ["import-blocks","provider-schemas"]
  },
  "moved-blocks": {
    s: "A declaration that an object has a new address, so renames and moves into modules update state in the plan instead of destroying and recreating the object.",
    d: "A moved block names the old and new addresses. During planning, before diffing, the engine rewrites matching state entries to the new address and reports it as a move. It handles renames, adding count or for-each, moving into or out of a module and renaming modules. Chains of moves are followed. The blocks stay in configuration so that anyone with older state also gets upgraded, and module authors use them to ship renames safely. The risk is leaving them out, since a rename alone is a destroy plus a create.",
    k: ["Declarative moves in configuration versus state commands: declarative moves reach every environment automatically, while commands must be run by hand in each.", "Keep moved blocks indefinitely versus remove them after rollout: keeping supports old states, but accumulates history in configuration."],
    p: ["A rename without a moved block destroys and recreates the object, including data it held.", "Removing a moved block before every environment has applied it makes the laggard plan a destroy."],
    v: "Rename a resource and add a moved block, plan, and confirm the plan reports a move with no create or destroy, then apply and confirm the object's real identifier is unchanged.",
    dep: ["resource-instance-records","state-manager","plan-diff"]
  },
  "removed-blocks": {
    s: "A declaration that a resource should leave management without being destroyed, optionally running destroy-time steps, so state forgets the object while the real one stays.",
    d: "Deleting a resource block normally plans its destruction. A removed block states the intent instead: the engine drops the object from state and leaves the real object in place, with a flag controlling whether destruction is skipped. It allows handing an object to another configuration or retiring management of something that must outlive the code. The block is reviewed like any other change. It is hard because afterward nobody manages the object, and another configuration importing it must apply in the right order.",
    k: ["Forget the object versus destroy it: forgetting is safe for shared or valuable objects, but leaves unmanaged infrastructure that may be forgotten.", "Declarative removal versus a state command: declarative removal is reviewed and repeatable, while commands are quick but happen outside review."],
    p: ["Objects removed from management are never imported elsewhere and become orphans with no owner or cost visibility.", "Removing a module's call without a removed block destroys everything inside it."],
    v: "Add a removed block that keeps the real object, apply, confirm state no longer lists it, and confirm the remote object still exists and is untouched.",
    dep: ["state-manager","plan-diff","lifecycle-rules"]
  },
  "state-surgery": {
    s: "Commands to list, show, move, remove, replace and pull state entries directly, used for recovery and migration when declarative blocks do not fit.",
    d: "These commands read or edit the state document outside a normal plan: listing addresses, showing one entry, moving an entry to a new address or to another state, removing an entry, forcing replacement and replacing a provider reference. They take a lock, write a backup and bump the serial. They bypass planning, so there is no review and no check that the result matches configuration. They exist for repairs after partial failures and for splitting state. The hazard is a mistyped address or a state edited while other runs are active.",
    k: ["Direct editing commands versus only declarative changes: commands handle any repair, but skip review and leave no trace in version control.", "Automatic backups on every edit versus none: backups allow rollback, at the cost of storing many copies that may hold secrets."],
    p: ["Removing a state entry for a live object makes the next plan try to create a duplicate.", "Editing a state file by hand without updating its serial or lineage makes backends reject or overwrite it."],
    v: "Move an entry between addresses with the command, run plan, and confirm no changes; then restore from the automatic backup and confirm state matches the earlier serial.",
    dep: ["state-manager","state-locking","resource-instance-records"]
  },
  "workspaces": {
    s: "Named instances of state that share one configuration, so the same code can run for several environments, each with its own state and variable values.",
    d: "A backend can hold multiple states under one configuration, selected by name. The current workspace name is available as an expression, so configuration can vary sizes or names by environment. Each workspace has its own lock, history and outputs. In managed services a workspace instead pairs configuration with variables, state, permissions and runs, closer to an environment. The difficulty is that the shared-state-per-name model hides which environment is selected, and sharing one code path for production and testing couples their changes.",
    k: ["Workspaces per environment versus separate directories with separate state: workspaces avoid copying code, while directories give clearer isolation and independent change.", "Branch-based environments versus workspace-based: branches allow environments to diverge, while workspaces keep one code version everywhere."],
    p: ["Applying while the wrong workspace is selected changes production with a command meant for testing.", "A condition on the workspace name sprinkled through code makes the environments subtly different and untested."],
    v: "Create two workspaces, apply different variable values in each, and confirm each has its own state and objects and that switching changes which one plan reports on.",
    dep: ["backend-abstraction","state-manager","input-variables"]
  },
});
