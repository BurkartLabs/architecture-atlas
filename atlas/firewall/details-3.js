// Details for the firewall plate, part 3: zones and policy objects, rule compilation and lookup.
ATLAS.details("firewall", {
  "security-zones": {
    s: "Named groups of interfaces or networks sharing a trust level, such as outside, DMZ and inside, so policy is written between zones instead of between individual interfaces.",
    d: "Each interface, VLAN or tunnel belongs to one zone. A packet's ingress zone comes from its arrival interface, and its egress zone from the routing decision. Policy attaches to the pair. Adding a new interface to an existing zone applies the zone's policy at once, which is the point. The difficulty is design: too few zones lump unequal systems together, too many produce a matrix nobody can reason about, and traffic inside one zone is often unfiltered by default.",
    k: ["Few coarse zones vs many fine zones: coarse is simple to operate, while fine limits lateral movement but multiplies zone-pair policies.", "Intra-zone traffic allowed by default vs filtered: allowed is convenient and matches switching expectations, but removes a control against lateral spread."],
    p: ["A new interface added to the inside zone inherits wide access nobody reviewed.", "Egress zone is unknown until routing, so rules that assume it before the route lookup misfire."],
    v: "Add a test interface to a zone and confirm it receives that zone's policy at once; send traffic between two hosts in the same zone and confirm the outcome matches the stated intra-zone setting.",
    dep: ["interfaces-and-vlans", "routing-integration"]
  },
  "interzone-policy": {
    s: "The set of rules for each ordered pair of zones, forming a matrix whose cells are often empty and default to deny, so every allowed path is stated once.",
    d: "Policies are indexed by ingress and egress zone. A packet is classified to a pair and matched only against that pair's rules, which keeps lists short and lookups fast. Directionality matters: allowing inside to outside does not allow the reverse, with return traffic handled by state. A review can read the matrix as a map of permitted trust relationships. The challenge is maintenance: services used by many zones repeat in many cells, and hairpin and any-to-any exceptions break the clean matrix.",
    k: ["Per-pair rule lists vs one global list with zone fields: per-pair lists are short and fast to review, while a global list is flexible for rules that span many zones.", "Explicit empty cells as deny vs inherit from a parent: explicit is auditable, while inheritance is concise and hides where a permission came from."],
    p: ["A rule added to the wrong cell, outside to inside instead of the reverse, opens the opposite direction.", "Shared services repeated in dozens of cells drift as each copy is edited separately."],
    v: "Allow one service from zone A to B, and confirm a new connection works A to B, fails B to A, and that the reply to the first passes through state without any rule in the B to A cell.",
    dep: ["security-zones", "rule-ordering", "default-action"]
  },
  "address-objects": {
    s: "Named, reusable definitions of hosts, ranges, subnets or groups, so rules refer to meaning such as payroll servers and a change is made once.",
    d: "An object holds addresses, ranges, prefixes, names to be resolved or other objects, with nesting. Rules refer to objects by name; the compiler expands them at build time. Names make review readable and enable bulk changes. The difficulty is hidden fan-out: editing one object changes every rule that references it, nested groups can cycle or grow enormous, and objects defined by DNS name resolve to addresses that change, so the compiled rule is only as current as its last refresh.",
    k: ["Reusable named objects vs literal addresses in rules: objects centralize change and readability, but a single edit has wide and non-obvious reach.", "Objects resolved from names vs fixed addresses: names follow services as they move, but add a dependency on DNS availability and its consistency."],
    p: ["An object edited for one rule widens twenty others that referenced it.", "A nested group with a typo includes an entire public prefix, and the compiled rule silently accepts it."],
    v: "Edit an object used by three rules and confirm the compiled policy for all three changes, the usage report lists them, and a cyclic nesting attempt is rejected at validation.",
    dep: []
  },
  "service-objects": {
    s: "Named definitions of protocols and port sets, such as web or database, which rules reference so service meaning is defined in one place.",
    d: "A service object has a protocol, port or range, sometimes a source port constraint or ICMP type, and groups combine several. Some devices tie services to application identification, so a service named web means identified applications and not a port number. Using them gives consistent usage across rules. The challenge is that a name implies a meaning the port may not deliver: services run on nonstandard ports, and permitting by port allows anything that can use it, including tunnels.",
    k: ["Port-based service objects vs application-based: ports are cheap and deterministic, while application-based is precise but needs inspection and fails when traffic cannot be classified.", "Broad service groups vs narrow ones: groups simplify rules, but a rule granting a group grants every member port, including ones added later."],
    p: ["Adding a port to a shared service group opens it in every rule using the group.", "A rule permitting web by port lets any tunneling tool that uses the same port through."],
    v: "Define a service group, reference it from two rules, add a port to the group, and confirm both rules begin matching the new port and the change diff shows both rule references.",
    dep: ["five-tuple-match"]
  },
  "dynamic-address-groups": {
    s: "Address sets whose members change automatically as tags, cloud instances, directory groups or threat feeds change, so rules follow the environment without edits.",
    d: "A group is defined by a filter such as all hosts tagged payment, or by a feed URL. A source of truth, such as an orchestrator, directory or API, updates membership, and the device applies updates to the live match structure without a full commit. This suits environments where addresses change often. The difficulty is ordering and trust: membership lags behind real change, a compromised feed can add or remove addresses, and updates must be applied atomically to avoid transient gaps.",
    k: ["Membership updated live vs only at commit: live updates track dynamic environments, but bypass the review and approval trail that commits have.", "Pull from a source vs push from the orchestrator: pull gives the firewall control of timing, while push gives lower latency and requires an authenticated writer."],
    p: ["Instances terminated and addresses reused leave a rule granting access to a new, unrelated tenant.", "An empty feed response removes all members and turns an allow-list into a deny, or a deny list into nothing."],
    v: "Tag a new host as a member, confirm a rule referencing the group matches it within seconds without a commit, remove the tag, and confirm matching stops and the log shows both membership changes.",
    dep: ["address-objects", "incremental-update"]
  },
  "policy-layers": {
    s: "A hierarchy of policy sets, such as global pre-rules, local rules and global post-rules, evaluated in order so central teams can enforce guardrails that local administrators cannot override.",
    d: "Policy is split into layers with owners. A central team places mandatory denies and allows before the local layer and fallbacks after it. Evaluation walks the layers in a defined order, and locally scoped rules apply only to the devices or zones they target. Inheritance lets one change reach a fleet. The challenge is predictability: the effective policy is the composition of layers, which no single place shows, and an allow in a lower layer cannot undo a deny above it.",
    k: ["Strict precedence by layer vs merging all rules: layered precedence enforces central control, while merging is flexible and lets local rules accidentally defeat guardrails.", "Fine-grained delegation vs one owner: delegation scales teams, but spreads accountability and creates conflicting edits."],
    p: ["A central deny layer blocks a business flow that local staff cannot see or change from their rule list.", "Effective policy is only viewable on the device, so audits of the central policy miss local layers."],
    v: "Place a deny in a global pre-layer and a matching allow locally, send matching traffic, and confirm it is dropped and the log names the global rule; display the effective flattened rule list and confirm order.",
    dep: ["rule-ordering", "address-objects"]
  },
  "virtual-contexts": {
    s: "Independent logical firewalls on one device, each with its own interfaces, policy, routing, administrators and resources, used for tenants or separated environments.",
    d: "The device partitions interfaces, rule sets, state tables, routing tables and often management access into contexts. Packets are assigned to a context by interface or VLAN and are processed only against that context's data. Resource limits cap each context's connections, rules and throughput. The hard parts are isolation and sharing: shared hardware and queues allow one tenant to affect another's latency, features such as clustering and logging must be context-aware, and the boundary between contexts must be as strong as a physical one.",
    k: ["Hard partition with reserved resources vs shared pool: reserved guarantees fairness and isolation, while sharing uses hardware better and risks noisy neighbors.", "Separate management per context vs one global administrator: delegation to tenants is safe, but multiplies administration and configuration backup."],
    p: ["One context exhausts the shared connection table and starves the others.", "Traffic leaked between contexts through a shared interface or route mistake bypasses both policies."],
    v: "Configure two contexts with overlapping private addresses, run traffic in both, and confirm each context's state table, rules and logs are separate and a limit set on one is not consumed by the other.",
    dep: ["security-zones", "flow-table", "interfaces-and-vlans"]
  },
  "rule-parser": {
    s: "The component that reads configuration or API input, checks syntax and references and produces the internal rule objects, rejecting what cannot be represented.",
    d: "Input in text, structured or interactive form is tokenized and turned into rule structures with resolved references to objects, zones and interfaces. The parser checks types, ranges, duplicate names and unsupported combinations, and reports errors with line and context. It must handle versions and aliases, defaults and abbreviations. Its output is the input to compilation. It is hard because the configuration is untrusted input in a security device, and because friendly errors and safe handling of malformed or enormous input pull in different directions.",
    k: ["Strict rejection vs lenient acceptance with warnings: strict stops mistakes at the door, while lenient eases migration and imports of old configurations.", "Validating references at parse vs at commit: parse-time errors are immediate, while commit-time checks see the whole set and cross-object relations."],
    p: ["A lenient parser silently ignores an unknown keyword, so an intended restriction is never installed.", "Import from another vendor's format maps a rule to a similar but broader meaning."],
    v: "Load a rule with a misspelled zone, an overlapping range and an oversized object list; confirm each is rejected with location and reason and the running policy is untouched.",
    dep: ["config-model"]
  },
  "object-expansion": {
    s: "The compiler step that replaces named objects and groups with the addresses and ports they denote, producing the flat set of conditions each rule really means.",
    d: "Nested groups, names, zones and negations are resolved recursively into prefixes, ranges and port sets, with duplicates merged and overlaps simplified. The result can be much larger than the source: a rule with ten source objects and ten service objects can produce hundreds of combinations when cross products are materialized. Expansion also records provenance, so hits map back to the original rule. The hard part is controlling the blowup while keeping equivalence provable.",
    k: ["Materialize the cross product vs keep sets as separate dimensions: cross products are simple for linear lookup, while separate dimensions use far less memory and need a capable classifier.", "Expand at compile time vs resolve lazily at match: compile-time is fast per packet, while lazy keeps memory small and costs lookups."],
    p: ["A group with a large nested range multiplies and exhausts rule memory only at commit.", "Provenance lost in expansion makes hit counters unattributable to the rule the author wrote."],
    v: "Compile a rule with five sources and eight services and confirm the compiled form shows the expected combination count, the original rule name on every entry and counters mapping back to one rule.",
    dep: ["address-objects", "service-objects", "negation-and-ranges"]
  },
  "rule-optimizer": {
    s: "A pass that merges adjacent equivalent rules, removes shadowed or duplicate ones and reorders independent rules by hit frequency without changing any packet's verdict.",
    d: "The optimizer proves, for each transformation, that every possible packet gets the same verdict: adjacent rules with the same action can merge into one with a combined set, rules covered by earlier ones can be dropped, and rules that cannot overlap can be reordered so frequently matched ones come first. The administrator's visible policy stays unchanged. The difficulty is proof and traceability: the transformation must handle every field, and logs and counters must still refer to the original rules.",
    k: ["Optimize at compile time vs leave rules as written: faster lookup and smaller memory, but compiled form differs from what the administrator sees and debugging needs a mapping.", "Reorder by hit counts vs preserve order: speeds linear scans, but needs a correctness proof for every swap and counters that stay stable."],
    p: ["A merge that ignores a logging or marking action drops the side effect of one of the rules.", "Reordering based on yesterday's traffic slows the rules a monthly job needs."],
    v: "Compile a policy with known adjacent mergeable rules, replay a large traffic sample through the original and optimized forms, and confirm identical verdicts for every packet and a smaller compiled size.",
    dep: ["shadow-analysis", "object-expansion"]
  },
  "prefix-tries": {
    s: "Tree structures keyed on address bits that find the longest matching prefix in time proportional to address length, the standard lookup for one address dimension.",
    d: "Each node represents a bit position; walking the destination or source address down the tree yields the most specific matching prefix and the rules or sets attached to it. Variants compress paths, use multiple bits per step for fewer memory accesses, or use hardware tables built from the same idea. A classifier uses several tries, one per dimension, and combines the results. The challenge is memory layout and update cost: pointer-heavy trees miss cache, and inserting into a compressed structure may rebuild large parts of it.",
    k: ["Multi-bit stride vs one bit per level: wider strides need fewer memory accesses, but expand prefixes and use more memory.", "Per-dimension tries combined afterwards vs a single multi-dimensional structure: combining is simple and updates well, while a joint structure is faster for lookup and harder to build."],
    p: ["A deep, sparse trie causes several cache misses per packet and halves throughput under certain address patterns.", "Incremental inserts degrade the layout until a periodic rebuild is done at a bad time."],
    v: "Insert a set of overlapping prefixes, query addresses at each boundary, and confirm the longest match is returned for every one, while measured memory accesses per lookup stay within the design bound.",
    dep: ["cache-aware-layout"]
  },
  "decision-tree-classifier": {
    s: "A classifier that recursively cuts the multi-dimensional rule space by field values, so a packet reaches a leaf holding a few candidate rules.",
    d: "The builder picks a field and cut points that split the rule set into balanced parts, repeats until each leaf holds few rules, and stores the tree. A packet walks from the root, testing one field per node, then scans the leaf. Rules that span a cut are replicated into several leaves, trading memory for speed. The hard problem is that for rule sets with many wildcards, replication explodes, and building quality depends on the rule structure, so worst cases are hard to bound.",
    k: ["Aggressive cutting that replicates rules vs conservative cutting: replication gives fewer leaf comparisons, but memory can grow far beyond the rule count.", "Rebuild the whole tree on change vs update in place: rebuilds produce the best structure, while in-place updates are fast and degrade balance over time."],
    p: ["A rule set with many wildcards in several fields makes the tree blow up in memory and fail to build at commit.", "A pathological leaf holding hundreds of rules becomes a linear scan for exactly the traffic an attacker sends."],
    v: "Build the tree for a policy with known wildcard-heavy rules, report depth, leaf sizes and memory, then classify a random sample and confirm every verdict equals a linear scan of the original list.",
    dep: ["rule-optimizer", "cache-aware-layout"]
  },
  "bit-vector-classifier": {
    s: "A classifier that looks up each field independently to get a bit vector of matching rules, then intersects the vectors so the first set bit is the winning rule.",
    d: "For every dimension, a structure such as a trie or interval table maps the field value to a bitmap with one bit per rule. A packet's per-field bitmaps are combined with bitwise AND, which parallelizes well on wide registers and hardware. The first set bit gives the highest-priority match. Memory grows with rules times distinct field values. The challenge is scale: bitmaps are as wide as the rule count, so large rule sets need aggregation or splitting to keep the ANDs cheap.",
    k: ["Bit vectors per field vs a decision tree: lookups are uniform, simple and parallel, but memory and bitmap width grow with rule count.", "Aggregated bitmaps vs full bitmaps: aggregation skips empty words and speeds large sets, at the cost of occasional false candidates that need a verify step."],
    p: ["A rule set of tens of thousands makes each AND span many cache lines, and throughput falls sharply.", "Updating one rule rewrites a bit in every field table, so frequent changes are expensive."],
    v: "Compile a policy of known size, classify packets chosen to hit the first, last and no rule, and confirm each result matches a linear scan while the cost per lookup is measured and recorded.",
    dep: ["prefix-tries", "cache-aware-layout"]
  },
  "incremental-update": {
    s: "Applying a small change to the compiled structures in place, such as adding a dynamic address, without rebuilding the entire classifier or interrupting traffic.",
    d: "Changes that are common and small, like membership of a dynamic group or a single rule, are patched into the live structure with fine-grained synchronization, such as epoch-based reclamation, so readers never see a partial update. Larger changes fall back to a full rebuild and swap. The system tracks which changes are safe to patch. The hard part is correctness under concurrency: lookups run on many cores while writes proceed, and removed memory cannot be freed while an older packet might still read it.",
    k: ["Patch in place vs always rebuild and swap: patching is fast and cheap for small changes, while a rebuild is simpler and always yields an optimal structure.", "Epoch-based reclamation vs locks on the lookup path: epochs keep readers lock-free and fast, but delay freeing memory and complicate bounds."],
    p: ["A patch applied in two steps leaves a window where a deny is absent and a flow passes.", "Repeated patching degrades the structure until a forced rebuild stalls a core."],
    v: "While sending line-rate traffic, add and remove a thousand addresses in a dynamic group, and confirm no packet is mis-judged in any capture, no throughput drop appears and a final lookup agrees with a fresh build.",
    dep: ["prefix-tries", "atomic-ruleset-swap"]
  },
  "atomic-ruleset-swap": {
    s: "Switching from the old compiled policy to the new one at a single instant, so every packet is judged entirely by one version and never by a mix.",
    d: "The new ruleset is built beside the old one, validated, and then published by changing one pointer or version number that the data path reads. Packets in flight finish on the old version, and the old memory is released after all readers have moved on. State entries carry a generation so existing flows can be revalidated. The challenge is the transition: flows allowed by the old policy and denied by the new must be handled by a stated rule, and memory for two full rulesets must be available at once.",
    k: ["Double buffering with pointer swap vs in-place edit: swap guarantees consistent decisions and instant rollback, but needs double memory and a build step.", "Revalidate existing flows against the new policy vs let them continue: revalidation enforces the change immediately, but resets users' sessions, while continuing leaves old access alive."],
    p: ["Insufficient memory for the second copy makes large commits fail only on the biggest policies.", "Existing flows allowed by a removed rule keep running for hours, so operators believe access is closed when it is not."],
    v: "Commit a policy that blocks an active flow and confirm that no packet is judged by a mixture, the flow's fate matches the revalidation setting within the stated time, and rollback restores it instantly.",
    dep: ["flow-table"]
  },
});
