// Details part 4: resource graph; planning.
ATLAS.details("infrastructure-as-code", {
  "reference-extraction": {
    s: "Scans every expression in the configuration and collects the references it makes to variables, locals, resources, data sources, modules and iteration values.",
    d: "Before any evaluation, the engine walks each expression's syntax tree and lists the traversals it contains, such as a reference to an attribute of a named resource. Each traversal is resolved to an address, including an instance key when one is given. The same scan covers nested blocks, conditions and lifecycle arguments. The output is the raw material for implicit edges. It is hard because references can be dynamic: a lookup by a computed key or a whole-collection reference depends on more than appears on the page.",
    k: ["Static scan versus tracking at evaluation time: static scanning lets the graph be built before any value is known, but cannot see dependencies hidden in function logic.", "Reference to a whole resource versus to a specific attribute: whole-object references are simpler, but create wider dependencies than needed."],
    p: ["Referencing a whole resource object when only one attribute is needed creates a dependency on all of its attributes and can cause cycles.", "References built from string keys in a map lookup are not seen, so the dependency is lost."],
    v: "Write a resource whose argument references another resource's attribute and confirm the graph output has an edge from the first to the second, and none for a string that merely looks like an address.",
    dep: ["expression-evaluator","blocks-and-attributes"]
  },
  "implicit-dependencies": {
    s: "Ordering inferred automatically whenever one object's expression uses another's attribute, so users rarely need to write dependencies by hand.",
    d: "Each extracted reference becomes an edge: the referencing object waits for the referenced one to be created or updated, and is destroyed before it. This works through locals, outputs and module boundaries, because those are also nodes. The engine also adds edges between resources and the provider configurations they use. Because the graph is derived from data flow, a value's availability and order of operations come from the same declarations. The weakness is relationships that carry no value, such as a policy that must exist before a service can start.",
    k: ["Infer dependencies from references versus require explicit ordering: inference removes boilerplate and errors, but cannot express relationships that exist outside the data.", "Attribute-level versus object-level edges: attribute-level edges are precise but harder to compute and explain."],
    p: ["A resource that depends on another only through behavior, not a value, is created too early and fails intermittently.", "Referencing an unrelated resource's attribute to force ordering creates a hidden coupling that the next editor removes."],
    v: "Create a network and a subnet referencing it, apply, then destroy, and confirm from the log that the subnet was created after and deleted before the network.",
    dep: ["reference-extraction","graph-builder"]
  },
  "explicit-dependencies": {
    s: "A declaration that lists objects an object must wait for even when it references none of their values, expressing ordering the data flow does not show.",
    d: "A dependency argument names resources, modules or data sources. The graph builder adds edges just as for references, with one behavioral difference: because no value is read, changes to the dependency can make dependent data sources defer their reads until apply. Typical uses are permissions that must exist before a workload runs, or a service that must be ready before a client is configured. They are a last resort because they widen dependencies and, on a module, make everything inside wait.",
    k: ["Explicit dependencies versus restructuring to pass a real value: restructuring documents the actual relationship, while explicit edges are quick and hide the reason.", "Depend on a module versus on a specific resource: a module dependency is simple but serializes everything inside it."],
    p: ["Depending on a whole module delays reads of every data source inside it until apply, turning a known plan into a mostly unknown one.", "An unexplained dependency stays forever because nobody knows what breaks if it is removed."],
    v: "Add an explicit dependency between two unrelated resources, apply, and confirm creation order in the log follows it and that removing it lets them start in parallel.",
    dep: ["graph-builder","implicit-dependencies"]
  },
  "graph-builder": {
    s: "Builds a directed acyclic graph of all configuration objects, instances, providers and state entries, as one graph for each operation, plan or apply.",
    d: "Nodes include resources, data sources, variables, locals, outputs, module expansions and provider configurations; edges come from references, explicit dependencies and provider ownership. The builder first adds nodes from configuration, then merges objects found only in state so they can be destroyed, and then runs a sequence of transformations. A plan graph and an apply graph differ in content: apply includes only the planned changes. The hard part is that the graph's shape changes during the walk as expansion counts become known.",
    k: ["Build a fresh graph for each operation versus persist one: fresh graphs always reflect current configuration and state, at the cost of rebuilding for large estates.", "One graph with nodes for state-only objects versus a separate destroy pass: one graph orders deletions with everything else, but is harder to reason about."],
    p: ["A graph built before expansion counts are known cannot contain instance nodes, so later edges must be added mid-walk.", "Objects present in state but removed from configuration are missed if the builder only reads configuration."],
    v: "Dump the graph for a three-resource configuration, confirm node and edge counts match expectation, then remove one resource from configuration and confirm it appears as a destroy node.",
    dep: ["reference-extraction","implicit-dependencies","explicit-dependencies","graph-transforms","state-manager"]
  },
  "graph-transforms": {
    s: "An ordered pipeline of passes that adds, removes and reconnects nodes after the initial graph is built, such as provider attachment, orphan handling and root connection.",
    d: "Each pass takes the graph and mutates it. Typical passes attach each resource to its provider, add nodes for state entries with no configuration, connect create and destroy ordering for replacements, prune unused providers, apply target filters, add a single root and compute transitive reduction. Pass order matters, because later passes assume earlier ones ran. This design lets features be added without touching the core builder, but it makes behavior emergent: understanding why an edge exists means reading several passes.",
    k: ["Composable passes versus one monolithic builder: passes isolate features and are testable alone, but ordering bugs are subtle.", "Transitive reduction versus keeping every edge: reduction makes the graph easy to visualize, while full edges are easier to debug."],
    p: ["Inserting a pass in the wrong position quietly drops provider edges, and resources are walked before their provider is configured.", "A pass that mutates shared node objects leaks changes into later operations."],
    v: "Run a plan with a target filter and confirm the dumped graph contains the target and only its dependencies, then remove the filter and confirm the full graph returns.",
    dep: ["graph-builder"]
  },
  "count-expansion": {
    s: "Creates N instances of a resource or module from a numeric argument, addressing each by index and expanding the single declaration into many graph nodes.",
    d: "A resource with a count argument is expanded once the number is known, usually after variables are evaluated, into instances addressed by position. Each instance evaluates its own expressions with an index value available. State stores a list. The expansion is done during the graph walk because the count may depend on other values. It is the simpler of the two mechanisms, with a well-known flaw: instances are identified by position, so removing an element from the middle shifts every later one.",
    k: ["Count versus for-each: count is simple and ideal for on-or-off switches, but positional identity makes list edits destructive.", "Conditional creation with count of zero or one versus a separate module: count switches are concise, but spread conditionals across a configuration."],
    p: ["Removing one element from a list that drives count renumbers later instances and causes replacement of resources that did not change.", "A count that depends on an unknown value prevents planning any resource that references the collection."],
    v: "Create three instances with count, remove the first from the driving list, and confirm the plan shows updates or replacements for the later instances because their indexes shifted.",
    dep: ["graph-builder","expression-evaluator","unknown-values"]
  },
  "for-each-expansion": {
    s: "Creates one instance per element of a map or set, addressed by key, so adding or removing an element affects only that instance.",
    d: "A for-each argument takes a map or a set of strings. Each key becomes the instance's address and each value is available as an iterator. State stores instances in a map keyed the same way. The collection's keys, not necessarily its values, must be known at plan time, because the engine needs to know which addresses will exist. Hard parts are exactly that restriction, and the need to choose keys well, since a key derived from a changing value changes the address and forces replacement.",
    k: ["For-each keyed by stable names versus count by position: keys survive reordering and removal, but need a map or set and meaningful keys.", "Keys from configuration versus keys from resource attributes: configuration keys are known early, while attribute keys are unknown until apply and cannot expand."],
    p: ["Using a key derived from an attribute assigned at creation fails with an error that the keys cannot be determined until apply.", "Changing a key spelling is a destroy-and-create unless a moved block is added."],
    v: "Create instances from a three-key map, delete the middle key, and confirm the plan shows exactly one destroy and no changes to the others.",
    dep: ["graph-builder","expression-evaluator","unknown-values"]
  },
  "cycle-detection": {
    s: "Detects circular dependencies between objects and reports the objects forming the loop, since a cycle makes ordering impossible.",
    d: "After the graph is built, a strongly-connected-components pass finds any group of nodes that depend on each other, directly or through intermediaries. The error lists the objects in the cycle so authors can break it. Typical causes are two security groups referencing each other's identifiers, or an output feeding back into its own module. The usual fix is to move one side of the relationship into a separate resource. It is hard because the reported cycle can include locals and providers, and the real mistake may be a whole-object reference.",
    k: ["Fail on any cycle versus allow cycles through unknown values: failing is predictable, while tolerant handling would need runtime ordering that the model does not have.", "Report the whole cycle versus only the first edge: the whole loop is more useful, but long loops are noisy."],
    p: ["Mutually referencing network rules are written inline and can only be resolved by splitting them into separate rule resources.", "The cycle message lists internal nodes such as provider closures that authors do not recognize."],
    v: "Write two resources referencing each other and confirm validation fails with a cycle error listing both addresses, and that splitting one reference into a separate resource makes it pass.",
    dep: ["graph-builder"]
  },
  "refresh-and-drift": {
    s: "Reads the real state of every managed object from its provider and updates the working state to match, exposing changes made outside the tool.",
    d: "Before planning, the engine walks the graph calling each provider's read operation with the identifiers from state. Returned attributes replace prior values in a working copy of state, and differences are reported as changes made outside the tool. Objects not found are removed from the working state, so the plan will recreate them. Refresh costs one or more API calls per object, which dominates plan time on large estates. Drift can be intentional, as with autoscaling, so some attributes must be ignored.",
    k: ["Refresh on every plan versus skip it: refresh keeps the plan truthful but is slow and rate-limited; skipping is fast but plans against stale state.", "Write refreshed values to state automatically versus only show them: auto-update keeps state accurate, but accepts unreviewed external changes into the record."],
    p: ["Refresh of a large estate hits API rate limits and produces errors that look like provider bugs.", "A resource deleted outside the tool is silently planned for recreation, with no prompt to confirm that was intended."],
    v: "Change a tag on a managed object by hand, run a refresh-only plan, and confirm it reports the drifted attribute and that applying it updates state without changing the real object.",
    dep: ["provider-lifecycle-calls","state-manager","resource-instance-records"]
  },
  "plan-diff": {
    s: "Compares the configuration's desired values with prior state for every instance and produces a set of planned actions: create, update, replace, delete or no-op.",
    d: "For each instance the engine evaluates configuration into a proposed new value, then asks the provider to plan the change given the prior value and the proposal. The provider returns the final planned value, marks attributes that will be computed as unknown, and lists attributes whose change requires replacement. The engine records the action and the change. Results are checked for consistency: the provider may not change values the configuration set explicitly. The hard part is that diffing is provider-defined, so attributes that look equal can still differ.",
    k: ["Provider-computed plans versus engine-computed diffs: provider planning handles normalization and defaults correctly, but puts correctness in many separate programs.", "Compare to refreshed state versus to the last applied state: refreshed state shows real drift, while last applied state is cheaper but may hide it."],
    p: ["A provider that reports a normalized value different from configuration produces a perpetual diff on every plan.", "Attributes ignored by a lifecycle rule hide changes that later cause a larger replacement."],
    v: "Change one argument in configuration and confirm the plan lists exactly that instance as an update with a before and after value, and that all other instances show no changes.",
    dep: ["expression-evaluator","provider-lifecycle-calls","state-manager","refresh-and-drift"]
  },
  "unknown-values": {
    s: "A marker for values that cannot be known until apply, such as identifiers assigned by the remote system, carried through the plan so dependent expressions stay unresolved.",
    d: "When a resource will be created or changed, attributes the remote system assigns are planned as unknown. Any expression using an unknown yields an unknown, preserving types where possible, and it is displayed as known after apply. During apply, once the real value exists, dependents are re-evaluated. Unknown values limit planning: they cannot be used as for-each keys, in count, or in provider configuration without restrictions. They are hard because behavior depends on them everywhere, and a plan must still be checkable.",
    k: ["First-class unknown values versus requiring everything to be known: unknowns allow one plan for a whole estate, but limit expansion and checks.", "Partially known structures versus whole-value unknown: partial knowledge preserves useful detail, but every function must handle it."],
    p: ["Using an unknown value as a for-each key fails planning and forces a split into two applies.", "A provider configured from an unknown value cannot be started, so every resource of that provider cannot be planned."],
    v: "Plan a resource whose identifier feeds another resource's argument and confirm that argument shows as known after apply, then apply and confirm the final value matches the created object.",
    dep: ["expression-evaluator","plan-diff","apply-consistency-check"]
  },
  "replace-vs-update": {
    s: "The decision, made per changed attribute, of whether an object can be modified in place or must be destroyed and created again.",
    d: "Provider schemas or plan calls mark certain attributes as forcing replacement, such as the name or region of an object. If any such attribute changes, the action becomes replace; otherwise it is an in-place update. The plan shows which attribute forced it. Replacement order depends on lifecycle: destroy then create by default, or the reverse. Dependent objects may also change because the replaced object's identifier changes. The risk is that replacement is destructive: data on the object is lost, and downstream references churn.",
    k: ["Replacement as the safe default for unsupported changes versus refusing the change: replacement completes the task, but can destroy data without a stronger warning.", "Replace dependents cascading versus updating them in place: cascading is correct when identifiers change, but amplifies the blast radius."],
    p: ["A one-line change to a name argument forces replacement of a database that holds the only copy of the data.", "Replacement cascades to dependents that were not touched in the diff, and the plan summary under-reports them."],
    v: "Change an attribute marked as forcing replacement and confirm the plan shows replace with that attribute annotated, and that applying creates a new identifier different from the old one.",
    dep: ["plan-diff","provider-schemas","create-before-destroy"]
  },
  "plan-file": {
    s: "A serialized artifact holding the planned changes, the configuration snapshot, prior state and variable values, so exactly what was reviewed can later be applied.",
    d: "A plan written to a file bundles the plan graph's changes, a copy of the configuration, a snapshot of state at plan time, variable values and provider requirements, in a versioned format. Applying the file needs no further evaluation of configuration. Sensitive values inside are included in plain or lightly encoded form. The format is tied to the exact tool and provider versions that created it. It is hard to treat safely: it is both a review artifact and a secret-bearing credential-like object.",
    k: ["Self-contained plan versus a reference to configuration: self-contained files are exact and portable, but large and hold secrets.", "Versioned binary format versus a documented open one: binary is compact and strict, while open formats invite tooling that outlives the version."],
    p: ["A plan file uploaded as a pipeline artifact exposes sensitive values to everyone who can download artifacts.", "A plan created by one tool version cannot be applied by another, and fails after an upgrade."],
    v: "Write a plan file, inspect it as JSON, confirm it lists changes and carries a format version, and check that sensitive attributes are marked and the file refuses to apply under a different version.",
    dep: ["plan-diff","state-snapshots","provider-versions"]
  },
  "saved-plan-apply": {
    s: "Applies a previously written plan file exactly as reviewed, refusing to proceed if state has changed since the plan was made.",
    d: "Apply loads the plan, opens the backend, takes the lock and compares the current state's serial and lineage with those recorded in the plan. If they differ, it stops with a stale plan error. If they match, it applies the recorded changes without re-evaluating configuration or prompting. Provider configuration is rebuilt from values in the plan. The behavior gives review-then-apply integrity. It is hard operationally, because any other applied change to the same workspace in between invalidates the plan, forcing a new review.",
    k: ["Strict staleness check versus applying anyway: strictness guarantees what was reviewed is what runs, but forces repeated planning on busy workspaces.", "Re-evaluate configuration at apply versus replay recorded values: replay is exact, while re-evaluation picks up new data source results."],
    p: ["Two plans made from the same state: applying the first makes the second stale, and the pipeline fails after approval was already given.", "Plans applied after a long delay act on infrastructure that has drifted past what the reviewer saw."],
    v: "Make a plan, apply a different change to the same workspace, then apply the first plan and confirm it is rejected as stale with no provider write calls issued.",
    dep: ["plan-file","state-locking","state-snapshots"]
  },
  "plan-renderer": {
    s: "Turns the plan's structured changes into readable output: symbols for each action, attribute-level before and after values, and a summary count of additions, changes and deletions.",
    d: "The renderer walks the change set and prints each instance with an action symbol, the reason for replacement, the attributes that change and unknown values as known after apply. Sensitive values are replaced with a placeholder, and large structures collapse to the elements that differ. A summary line counts actions. It also reports changes made outside the tool found during refresh. The difficulty is readability at scale: thousands of changes need grouping, and a formatting bug can make a destroy look like an update.",
    k: ["Full detail versus summarized output: full detail supports careful review, but long plans bury the dangerous lines.", "Highlight destroys and replacements versus uniform formatting: emphasis draws attention to risk, but relies on color that logs often strip."],
    p: ["Colors stripped in a pipeline log make a destroy-and-create indistinguishable from an in-place update at a glance.", "Nested structure diffs collapse unchanged siblings, hiding the context that explains a change."],
    v: "Render a plan that updates one attribute, replaces one instance and deletes one instance, and confirm the symbols, the replacement reason, the unknown markers and the counts all match the structured plan.",
    dep: ["plan-diff","sensitive-values"]
  },
  "targeted-plans": {
    s: "Plan modes that restrict work to named objects, or only refresh state with no configuration changes, for narrower runs during recovery or investigation.",
    d: "A target option limits the graph to selected objects and what they depend on, skipping everything else. A refresh-only mode reads the real world, shows differences and offers to record them in state without changing any infrastructure. A replace option forces a specific instance to be recreated, and a destroy mode plans deletion of everything. Targeting is intended for exceptional use: partial runs can leave configuration and state inconsistent, since dependents of the target are not evaluated.",
    k: ["Offer targeting as a normal option versus restrict it: availability helps recovery, but routine use hides graph problems and creates drift between objects.", "Refresh-only that updates state versus a plan that reports only: updating accepts reality as a record, while reporting alone leaves reconciliation to a person."],
    p: ["Routine targeted applies to skip a slow or broken object leave it permanently out of sync with the rest.", "Targeting a resource skips its dependents, so outputs and downstream attributes are stale after apply."],
    v: "Target one resource among three, plan and apply, and confirm only that instance and its dependencies were touched, then run a normal plan and confirm the remaining changes are still pending.",
    dep: ["graph-transforms","refresh-and-drift","plan-diff"]
  },
});
