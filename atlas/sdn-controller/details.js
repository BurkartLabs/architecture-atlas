// Details for the SDN controller plate, part 1: northbound interfaces, intent and policy, multi-tenancy.
ATLAS.details("sdn-controller", {
  "rest-api": {
    s: "A request-and-response interface over HTTP where clients read and change network resources such as devices, links, flows and intents using a stable resource model.",
    d: "Resources are addressed by path and exchanged as JSON documents. Reads come from the controller's state model, and writes are validated, authorized, then turned into intents or rules. Long operations return an identifier the client polls, because a change may take seconds to reach every device. The hard parts are versioning, since scripts live for years, and honesty about asynchrony: a successful response must say whether the change was accepted, applied or merely queued.",
    k: ["Synchronous apply versus accept-then-poll: waiting gives simple scripts but ties up connections and times out on large changes; polling scales but pushes status handling onto every client.", "Fine-grained resources versus coarse bulk endpoints: fine resources are easy to reason about, but installing ten thousand rules one call at a time is too slow."],
    p: ["A 200 response read as 'installed on devices' when it only meant 'stored', so clients proceed before traffic works.", "Unversioned field changes break automation written months earlier, with failures far from the cause."],
    v: "Post a path request, poll its status to completion, then fetch the installed rules from the state model and from a switch directly and confirm they match.",
    dep: ["data-models","network-state-model","authn-authz"]
  },
  "streaming-api": {
    s: "A subscription interface that pushes topology, state and event changes to applications as they happen, with resumable cursors so a reconnecting client misses nothing.",
    d: "Clients subscribe to event types such as link down, host moved or flow removed, optionally filtered by device or tenant. The controller fans events out from its internal bus over long-lived connections, tagging each with a sequence number. Reconnecting clients present the last number seen and receive the gap, or a full snapshot if the gap is too old. The difficulty is slow consumers: one that cannot keep up must be bounded or dropped, never allowed to stall the controller.",
    k: ["Push with bounded per-client buffers versus unbounded queues: bounded protects the controller but forces slow clients to resynchronize; unbounded memory grows until the process dies.", "Snapshot-then-stream versus stream only: a snapshot gives a consistent starting point but costs a large initial transfer."],
    p: ["A client that reconnects without a cursor assumes continuity and silently misses a link failure.", "Events delivered out of order across partitions make a client believe a link is up when it is down."],
    v: "Subscribe, disconnect the client, take a link down and bring it up, reconnect with the saved cursor, and confirm both events arrive once, in order.",
    dep: ["event-bus","data-models"]
  },
  "typed-rpc-api": {
    s: "A strongly typed, schema-first call interface with streaming support, used where programs need efficient bulk operations and generated clients rather than hand-written HTTP calls.",
    d: "Messages and services are declared in a schema from which client and server stubs are generated in many languages. Calls carry typed rules, queries or intents, and server-streaming calls deliver telemetry or event feeds. Binary encoding keeps bulk rule installation fast. The cost is rigidity: schema evolution must follow compatibility rules, and field numbers can never be reused. Debugging needs tooling because the wire form is not readable.",
    k: ["Schema-first typed calls versus loose JSON resources: typed calls catch errors at build time and encode compactly, but need code generation and stricter evolution discipline.", "One streaming connection with multiplexed calls versus one connection per call: multiplexing saves setup but one stalled stream can starve others without flow control."],
    p: ["Reusing a retired field number gives old clients silently wrong data.", "Bulk calls with no size limit let one application exhaust controller memory."],
    v: "Generate a client from the schema, install ten thousand rules in one streamed call, and confirm the count and a sample of rules on a device match the request.",
    dep: ["data-models","authn-authz"]
  },
  "data-models": {
    s: "The formal schemas describing devices, topology, services and policy, so that every interface and every application agrees on names, types and constraints.",
    d: "Models are written in a schema language with typed leaves, lists, references and validation constraints. The controller validates every write against the model, derives the REST and RPC interfaces from it, and uses it to map vendor-specific fields onto a common shape. The hard part is the tension between a common model that hides differences and device-specific extensions that expose features customers actually buy. Models also need versioned migration for stored data.",
    k: ["One normalized model versus per-vendor models: normalization lets applications be portable, at the cost of dropping features not shared by all devices.", "Strict constraint validation at write time versus lenient storage: strict rejects bad input early but can block urgent changes over minor rule violations."],
    p: ["Model changes without data migration make stored configuration unreadable after an upgrade.", "A 'common' model quietly encodes one vendor's assumptions, so other devices need constant special cases."],
    v: "Submit a change violating a model constraint, such as a VLAN identifier out of range, and confirm it is rejected with the offending path named and nothing is written to any device.",
    dep: []
  },
  "app-sdk": {
    s: "Libraries and a runtime contract that let third parties write controller applications such as routing, load balancing or security, using the controller's state, events and rule APIs.",
    d: "Applications register for events, read state through typed accessors and submit rules through a service that arbitrates between them. The SDK defines lifecycle hooks, configuration, logging and resource limits. In-process modules are fast but share the controller's fate; out-of-process applications over RPC are isolated but slower. The difficulty is conflict: two applications writing overlapping rules need a defined priority and ownership model, or the last writer wins at random.",
    k: ["In-process modules versus out-of-process applications: in-process is faster for packet-in handling, but a faulty module can crash the whole controller.", "Applications write rules directly versus through an arbitrating service: arbitration prevents silent overwrites but adds latency and a policy the application authors must learn."],
    p: ["An application that blocks in an event handler stalls every other application sharing the event thread.", "Rules installed without an owner tag cannot be cleaned up when the application is removed."],
    v: "Load a sample application, then unload it and confirm every rule it installed is removed from the devices and the state model, while other applications' rules remain.",
    dep: ["module-runtime","event-bus","network-state-model"]
  },
  "operator-console": {
    s: "The web interface and command-line client where operators browse topology, inspect rules, submit intents and review audit and health, all through the same northbound interfaces.",
    d: "The console renders the topology graph, device and link detail, flow tables, alarms and change history. It holds no private data path: every view and action goes through the public API, so anything a person can do an automation can do. The challenge is scale and honesty: drawing tens of thousands of nodes needs aggregation, and a view must show how fresh its data is, because a stale picture of a failed link causes wrong decisions.",
    k: ["Console built on the public API versus a privileged backdoor: the public API keeps parity and audit, but exposes any API gaps as console limitations.", "Live-updating views versus manual refresh: live views catch failures quickly but can shift under an operator mid-action."],
    p: ["A topology view that does not show data age lets operators trust a picture hours out of date.", "A destructive action offered with one click and no preview of affected devices causes outages."],
    v: "Take a link down in a lab and confirm the console marks it down within the documented time, shows when the state was last updated, and the audit log records the operator's later change.",
    dep: ["rest-api","streaming-api"]
  },
  "intent-model": {
    s: "A declarative description of what the network must achieve, such as connectivity between groups, bandwidth, or isolation, independent of devices, paths or rules.",
    d: "An intent names endpoints (hosts, groups, services), a goal (connect, isolate, prefer) and constraints (bandwidth, latency, protocol). It is stored as desired state with a status of pending, compiling, installed or failed. The model must be rich enough to express real needs but small enough to compile predictably. The hard part is semantics: what 'connect' means when a host moves or a link fails is a promise the system must keep long after the request, not a one-time action.",
    k: ["Outcome intents versus device-level rules: outcomes survive topology change, but compilation is complex and operators cannot see exactly what will be installed.", "Closed intent vocabulary versus open extension: a closed set compiles reliably, an open one lets users express anything but loses guarantees."],
    p: ["An intent that is installed once and never re-evaluated becomes wrong after the first topology change.", "Vague goals such as 'low latency' with no number cannot be tested or satisfied."],
    v: "Submit a connectivity intent between two hosts, confirm traffic flows, fail a link on the chosen path, and confirm the intent's status flaps and recovers with traffic restored on another path.",
    dep: ["network-state-model","data-models"]
  },
  "policy-language": {
    s: "A restricted language for stating who may talk to whom and how traffic is treated, written by operators and checked before it can touch the network.",
    d: "Policies are expressed as predicates over endpoints and traffic with actions such as permit, deny, redirect or rate-limit. The language is deliberately small, often declarative with explicit ordering or priorities, so the compiler can prove properties such as termination and detect overlaps. Names refer to groups, not addresses, so membership changes do not require editing policy. The difficulty is giving enough expressiveness for real security needs without becoming a general programming language nobody can analyze.",
    k: ["Declarative restricted language versus general code: restricted can be analyzed and verified, general is flexible but cannot guarantee safety.", "Group-based references versus address-based: groups survive address changes, but depend on correct and timely group membership data."],
    p: ["Implicit default actions differ from what authors assume, leaving traffic open or blocked unexpectedly.", "Ordering semantics hidden in file position cause policy meaning to change when files are merged."],
    v: "Write a deny rule for a group, move a host into that group, and confirm the host's traffic is blocked on the devices within the documented time with no edit to the policy text.",
    dep: ["intent-model","data-models"]
  },
  "intent-compiler": {
    s: "Translates intents and policies into concrete per-device rules and configuration by combining them with the topology, path choices and device capabilities.",
    d: "The compiler resolves names to endpoints, asks path computation for routes, chooses match fields and actions the target tables support, and emits a per-device rule set with an update plan. It is a real compiler with intermediate forms: intent, network-wide rules, then device-specific rules. It must be incremental, because recompiling the whole network for one host move is far too slow. Output must be deterministic so the same input gives the same rules and diffs are small.",
    k: ["Full recompilation versus incremental delta compilation: full is simpler and easy to verify, incremental is fast but complex to keep correct under dependencies.", "Compile to portable rules then specialize versus compile directly per device: portability helps multi-vendor, but loses chances to use device-specific features."],
    p: ["Nondeterministic compilation produces different rule sets for the same intent, causing needless churn on every run.", "Ignoring a device's table limits yields rules that cannot be installed and a partial deployment."],
    v: "Compile the same intent set twice and confirm byte-identical rule output. Then change one host's location and confirm only rules for the affected devices change.",
    dep: ["intent-model","policy-language","shortest-path","device-inventory","table-capacity"]
  },
  "conflict-detection": {
    s: "Finds intents and rules that contradict, shadow or duplicate each other, and reports them before installation rather than letting one silently override another.",
    d: "Rules are modeled as sets of packets with actions and priorities, and the detector checks for overlap between rules with different actions, rules that can never match because a higher one covers them, and intents that demand incompatible resources such as the same bandwidth twice. Resolution is by priority, ownership or rejection. The cost of exact checking grows with rule count and field overlap, so practical systems use indexes and incremental checks.",
    k: ["Reject conflicting intents versus resolve by priority: rejection is safe and explicit, priority resolution keeps things moving but hides which policy actually won.", "Check at submission versus at install time: submission checks give fast feedback, install-time checks catch conflicts from interleaved changes."],
    p: ["Conflicts between two applications are only found after traffic is misrouted in production.", "Shadowed rules that never match accumulate and mislead operators about what is enforced."],
    v: "Submit a permit and a deny covering the same traffic with equal priority and confirm the second is rejected with both identified. Then raise one priority and confirm the report names which rule wins.",
    dep: ["flow-rule-model","intent-model","policy-composition"]
  },
  "policy-composition": {
    s: "Combines policies from several authors or applications into one coherent rule set, defining how they stack, which wins and how they can be changed independently.",
    d: "Real networks have security, routing, QoS and tenant policies owned by different teams. Composition defines operators such as sequential (traffic passes each in turn), parallel (actions are merged) and override, then compiles the combination, often into a multi-table pipeline where each policy has its own stage. The difficulty is making composition predictable: each author should reason locally, yet the combined behavior must still be provable.",
    k: ["Sequential stages per policy versus a flattened single table: stages keep policies independent and debuggable, but consume table stages and entries.", "Explicit composition operators versus priorities alone: operators state intent clearly, while priorities are simple but become a global ordering nobody owns."],
    p: ["Two teams each add a catch-all rule at high priority and neither is aware the other's policy is dead.", "Flattening many policies multiplies rule counts and overflows hardware tables."],
    v: "Compose a firewall policy and a routing policy, send traffic that should be blocked and traffic that should be routed, and confirm each is handled by the correct stage with matching hit counters.",
    dep: ["policy-language","table-pipeline"]
  },
  "service-templates": {
    s: "Reusable parameterized definitions of common network services, such as a tenant network or a guarded application tier, that expand into intents and configuration on demand.",
    d: "A template declares inputs (names, address ranges, bandwidth), the intents and virtual resources it creates and the order of creation. Instantiating one produces a tracked service with a life cycle: create, modify, delete, with automatic cleanup of everything it made. Templates are versioned and validated against the model. The difficulty is evolution: upgrading a template should update live services safely, without recreating them and interrupting traffic.",
    k: ["Templates that own their resources versus loose scripts: ownership makes cleanup and upgrade reliable, but needs a resource-tracking system.", "In-place template upgrade versus delete-and-recreate: in-place avoids outages but requires diff and migration logic for every change."],
    p: ["Deleting a service leaves orphan rules because nothing recorded which resources belonged to it.", "Template parameters with no validation let a typo create an overlapping address range."],
    v: "Instantiate a template, confirm all its resources exist, delete the service, and confirm the controller and devices contain none of them while neighboring services are untouched.",
    dep: ["intent-model","data-models","virtual-network-model"]
  },
  "reconciliation-loop": {
    s: "A continuous process that compares desired state with what devices actually hold and issues the changes needed to close any difference.",
    d: "The loop reads desired state from intents and compiled rules, reads actual state from the installed-rule mirror and device queries, computes a diff and issues updates, then repeats. It handles devices that reboot and lose rules, manual changes and lost messages without special cases. It is level-triggered, acting on current difference rather than on a stream of past events. The difficulty is avoiding fights with humans or other controllers and bounding repair rate so a mass reboot does not overload devices.",
    k: ["Level-triggered reconciliation versus event-driven change only: reconciliation self-heals after missed events, at the cost of periodic full comparisons.", "Revert manual device changes versus report them: reverting enforces the model, reporting avoids undoing an emergency fix."],
    p: ["Two controllers reconciling the same device with different desired state overwrite each other endlessly.", "Reconciliation that runs at full speed after a site-wide reboot floods devices with rules."],
    v: "Reboot a switch so it loses its rules, and confirm the loop detects the difference and reinstalls them within the documented interval, with traffic recovering and no other device touched.",
    dep: ["desired-vs-actual-state","installed-rule-mirror","update-pacing"]
  },
  "tenant-model": {
    s: "The representation of separate customers, teams or projects sharing the controller, each with its own resources, address spaces, policies and view of the network.",
    d: "A tenant owns virtual networks, intents, quotas and users, and is allowed to see only those. Overlapping address ranges between tenants are normal, so identifiers must include the tenant. Hierarchies (organization, project) allow delegation. The model decides what is global, such as the physical topology and device inventory, and what is per tenant. The hard part is leakage: every query, event and error message must be tenant-scoped, and a single missed filter exposes another tenant's data.",
    k: ["Tenant identifier in every object key versus tenant-specific databases: keys are cheaper to run, separate databases give stronger isolation at higher operational cost.", "Hierarchical tenants versus flat: hierarchy matches organizations and delegation, but permissions inheritance becomes harder to reason about."],
    p: ["A global event stream not filtered by tenant leaks another tenant's host addresses.", "Using tenant-local names where global ones are expected causes collisions between tenants that both pick the same name."],
    v: "Create two tenants with the same address range and host names, then query as each and confirm neither can read, list or infer the other's objects through the API, events or error messages.",
    dep: ["data-models","authn-authz"]
  },
  "authn-authz": {
    s: "Establishes who or what is calling the controller, using credentials and tokens, and decides whether that caller may perform the requested action on the requested resource.",
    d: "Callers present short-lived tokens or client certificates. The controller verifies them against an identity provider, maps the identity to roles and tenant, and checks each request against permission rules at the API boundary. Applications and devices are principals too. Decisions are logged. The difficulty is placement: checks must cover every path, including streaming subscriptions and bulk calls, and long-lived streams must be cut when a credential is revoked.",
    k: ["Central authorization at the API gateway versus checks in each service: central is consistent and auditable, but internal paths that bypass the gateway are left unprotected.", "Short-lived tokens versus long-lived keys: short tokens limit theft damage, but demand refresh logic in every automation."],
    p: ["A streaming subscription authorized at connect time keeps delivering events after the user's access is revoked.", "Service accounts with unlimited scope in scripts are copied around and never rotated."],
    v: "Revoke a user's role while that user has an open event subscription and confirm the stream ends within the documented time and the next request returns a denial, both logged.",
    dep: ["tenant-model"]
  },
  "role-scopes": {
    s: "Named sets of permissions, such as read-only, tenant-admin and network-admin, bound to a tenant or part of the network, so access matches the job rather than the person.",
    d: "A role lists allowed actions on resource types, and a scope limits where the role applies: one tenant, one site, or a set of devices. Assignments bind identities or groups to roles at a scope. Fine-grained permissions let an application install rules for its own flows without being able to remove another's. The difficulty is design: too few roles force broad access, too many cannot be reviewed, and the rules for combining roles must be unambiguous.",
    k: ["Few coarse roles versus many fine-grained permissions: coarse roles are easy to audit but over-grant, fine permissions fit least privilege but become unreviewable.", "Allow-only roles versus allow and deny rules: allow-only is simpler to reason about, deny rules can express exceptions but order matters."],
    p: ["An 'operator' role that includes rule deletion on all devices is handed out for read access and used by an errant script.", "Scopes defined by device name break silently when devices are renamed."],
    v: "Assign a read-only role and attempt a write at every API in the interface list. Confirm each is denied and recorded, then confirm the same identity can read everything in its scope.",
    dep: ["authn-authz","tenant-model"]
  },
  "resource-quotas": {
    s: "Limits per tenant or application on consumable resources such as rules, bandwidth reservations, virtual networks and API call rates, protecting shared capacity.",
    d: "Quotas are checked on admission of intents and rule requests, comparing current usage to a limit, and rate limits are applied to API calls. Usage counts come from the state model and are updated transactionally with the change, or races let tenants overshoot. Table entries on switches are the scarcest resource, so quotas are often expressed in entries per device. The difficulty is that usage is distributed: a tenant's rules may sit on many devices and be expanded by compilation.",
    k: ["Hard limits that reject versus soft limits that alert: hard limits protect the shared tables, soft ones avoid surprising failures but allow overruns.", "Quota on user-visible objects versus on compiled rules: user-visible is easy to explain, compiled-rule quotas match true hardware cost but surprise users."],
    p: ["Counting intents instead of compiled rules lets one wildcard intent consume thousands of entries.", "Unbounded API call rates let one script starve all other clients."],
    v: "Set a tenant's limit to 100 entries, submit intents that would compile to 150, and confirm admission rejects the one that crosses the limit and the device holds no more than 100 for that tenant.",
    dep: ["tenant-model","installed-rule-mirror"]
  },
  "audit-log": {
    s: "A tamper-evident, append-only record of who changed what and when, covering API calls, rule installs, policy edits and logins, kept for investigation and compliance.",
    d: "Every state-changing request and every authorization decision writes a record with identity, tenant, source address, target, before and after values, and the controller instance. Records go to durable storage, and often to an external collector so a compromised controller cannot erase them. Hash chaining makes tampering detectable. Reads of sensitive data may be logged too. The difficulty is volume and linkage: tying a rule on a switch back to the human request behind it needs consistent identifiers across layers.",
    k: ["Synchronous audit write before commit versus asynchronous: synchronous guarantees nothing happens unrecorded but adds latency and a failure mode if storage is down.", "Log full before and after values versus references only: full values aid investigation but risk copying secrets into the log."],
    p: ["Rules installed by the reconciliation loop carry no link to the originating request, so cause cannot be traced.", "Logs kept only on the controller are lost or altered when it is compromised."],
    v: "Make a policy change as a named user, then trace from the audit record to the intent, the compiled rules and the installed rule on the device, and confirm each step is found by identifier.",
    dep: ["authn-authz","consensus-store"]
  },
  "isolation-enforcement": {
    s: "Mechanisms ensuring tenant traffic and control actions cannot cross boundaries, by encapsulation or match rules in the data plane and by scoping in the control plane.",
    d: "In the data plane, each tenant's traffic is tagged by a virtual network identifier at the edge and every rule matches on it, so tenants cannot reach each other even with overlapping addresses. In the control plane, applications and APIs are scoped, and rules submitted for one tenant are checked so they cannot match another's traffic. The difficulty is the shared paths: gateways, service chains, broadcast and control-plane packets are all places where isolation fails.",
    k: ["Enforce isolation at every hop versus only at the edge: every hop is robust against misconfiguration, but uses more table space and more rules to maintain.", "Controller-checked rules versus device-enforced boundaries: controller checks are flexible, device-enforced boundaries still hold when the controller is wrong."],
    p: ["A tenant-submitted wildcard rule matching all traffic on a shared device captures another tenant's packets.", "Broadcast or discovery packets flooded across all virtual networks reveal one tenant's hosts to another."],
    v: "Place two tenants' hosts with identical addresses on one switch, send traffic from each to the shared address, and confirm packet captures show each tenant's traffic only reaches its own host.",
    dep: ["tenant-model","virtual-network-model","match-fields"]
  },
});
