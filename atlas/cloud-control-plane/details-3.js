// Details for the cloud control plane plate, part 3: compute, placement and network virtualization.
ATLAS.details("cloud-control-plane", {
  "instance-api": {
    s: "The operations on virtual machines: launch, describe, stop, start, reboot, resize and terminate, exposed as the cloud's most used and most contractually stable interface.",
    d: "A launch call names an image, a type, a network placement, security groups, storage and tags, and returns an instance record in pending state. Other calls change power state or attributes, and describe calls list instances with filters. Behind it the service validates references across other services, claims quota, and starts a workflow. The difficulty is the breadth of parameters, each referencing another service's resource, and the need for describe calls to remain cheap and consistent while launches are churning.",
    k: ["Single launch call with every option vs separate calls to compose: one atomic request is easy for users; the parameter surface grows without end.", "Describe from a cache or replica vs from the primary: scales to heavy polling; a launch can be invisible for a moment after it returns."],
    p: ["A describe call served from a lagging replica says an instance does not exist right after it was created, and automation retries the launch.", "A launch partially succeeds, creating the instance but failing the network step, with no clear single error."],
    v: "Launch one instance with every optional parameter set and verify with describe, the network, storage and metadata service that each option took effect, then terminate and confirm all attached resources are released.",
    dep: ["instance-state-machine", "request-validation", "quota-model", "workflow-engine"]
  },
  "instance-state-machine": {
    s: "The defined states of an instance, such as pending, running, stopping, stopped and terminated, with the allowed transitions and who may trigger each.",
    d: "Each instance record has a state and a version. Transitions are triggered by customer calls, by the host reporting reality, and by the platform for maintenance or failure. The state machine forbids invalid moves, such as starting a terminated instance, and rules for who wins when two triggers collide use the version for compare-and-set. Billing starts and stops at defined transitions. The difficulty is that the control plane's record can disagree with the host's, so the machine must include states for uncertainty and recovery.",
    k: ["Compare-and-set on a version vs locking the record: concurrent triggers resolve without deadlock; callers must handle conflicts and retry.", "States for in-between conditions such as stopping vs only stable states: truthful and recoverable; more states for customers and billing to understand."],
    p: ["A host failure and a customer stop arrive together and the instance lands in a state no transition can leave.", "Billing keys off a state that the host reached before the control plane recorded it, producing a free or double-charged interval."],
    v: "Fire conflicting stop, terminate and host-failure events at one instance in randomized order many times and confirm every run ends in a valid terminal state with billing records matching the transitions.",
    dep: ["resource-database", "desired-state-reconciliation"]
  },
  "image-catalog": {
    s: "Stores and describes the bootable images from which machines are created, with ownership, visibility, versions and the metadata hosts need to boot them.",
    d: "An image record names the root disk snapshot, the architecture, boot mode, virtualization type and permissions. Images are public, private or shared with chosen accounts. They are built by customers from running instances or imported, and by the cloud for its own base images. Records point at storage managed by the snapshot service. Difficulty comes from provenance and safety: deprecated or compromised images must be hidden from new launches, and a launch must still work if the image is deleted afterward.",
    k: ["Images as snapshots plus metadata vs opaque blobs: reuse of the snapshot system and instant sharing; image behavior is tied to snapshot service features.", "Image deletion blocked while in use vs allowed: no surprise failures; owners cannot clean up and old data lingers."],
    p: ["A public image that contained a secret is copied thousands of times before anyone notices.", "An image deleted by its owner breaks the autoscaling group that launches from it."],
    v: "Create an image from an instance, launch from it in a second account after sharing, deprecate it, and confirm new launches are blocked while existing instances continue to run unchanged.",
    dep: ["snapshot-service", "resource-model", "policy-evaluation"]
  },
  "instance-types": {
    s: "The catalog of machine shapes, each defining processor count, memory, network and storage capabilities, mapped onto the physical host generations that can supply them.",
    d: "A type is a named bundle of resources and features, such as dedicated storage or accelerators. Types are grouped into families by purpose and generation. The catalog maps each type to host hardware classes that can run it and to the share of a host it consumes, which is what placement uses. New types appear with new hardware and old ones are retired slowly. The difficulty is that the catalog is both a product contract customers depend on and a packing problem the fleet must solve.",
    k: ["Fixed-size types vs custom sizing: fixed sizes pack onto hosts efficiently and are simple to price; customers pay for resources they do not need.", "Many fine-grained types vs few: fits workloads closely; the matrix of availability by zone becomes large and error-prone."],
    p: ["A type advertised in a zone has no free hardware of the right class and launches fail with capacity errors.", "Retiring an old type strands customers whose code and images assume specific hardware."],
    v: "For every type in a zone, launch one instance and verify from inside it that the visible processors, memory and network speed equal the catalog values, and that the host reports consumption matching the catalog share.",
    dep: ["capacity-inventory", "resource-model"]
  },
  "instance-metadata-service": {
    s: "A link-local endpoint reachable only from inside an instance that tells it about itself and hands it credentials, without any login.",
    d: "Software inside the instance queries a fixed link-local address to read its identifier, network configuration, user data and the temporary credentials of its attached role. The host's network layer intercepts those requests and the agent answers using the instance's own records, so no other instance can see them. Session tokens and hop limits defend against request forgery. It is hard because it is a credential endpoint reachable by any code on the machine, including a vulnerable application.",
    k: ["Token-protected metadata vs open GET requests: a forged request through an application bug no longer works; old software that expects plain requests breaks.", "Serve from the host vs from a central service: low latency and survives control plane outages; the host must be trusted to hold per-instance data."],
    p: ["A server-side request forgery in an application lets an attacker read the instance role's credentials.", "Containers on the instance can reach the same endpoint and take the instance's role."],
    v: "From inside an instance, fetch the credentials with and without a session token and with an extra network hop, and confirm only the token-bearing, direct request succeeds and the response matches the attached role.",
    dep: ["host-agent", "temporary-credentials", "virtual-interfaces"]
  },
  "autoscaling-groups": {
    s: "Maintain a desired number of instances from a template, adding or removing them in response to health and load metrics.",
    d: "A group has a launch template, bounds on size, target zones and scaling policies keyed to metrics, schedules or predictions. A controller compares the current count with the desired count, replaces unhealthy instances and spreads them across zones. Instances are registered with load balancers as they come up. The difficulty is control stability: reacting too fast oscillates, reacting too slowly misses spikes, and a failed launch loop can fill the account's quota or cost without delivering capacity.",
    k: ["Target tracking on a metric vs step policies: simple to configure and stable; less control over unusual workloads.", "Replace unhealthy instances automatically vs alert only: self-healing; a bad image or dependency outage causes a replacement loop."],
    p: ["A broken image makes every new instance fail its health check, and the group launches and kills them continuously and burns through quota.", "Scale-in removes the instance holding in-flight work because nothing told the group it was busy."],
    v: "Drive a load that raises the metric past the target and confirm the group grows to the expected size within the cooldown, spreads across zones, then shrinks after load stops without terminating busy instances.",
    dep: ["instance-api", "operational-metrics", "virtual-load-balancer", "placement-groups"]
  },
  "spot-capacity": {
    s: "Spare capacity sold at a discount with the condition that the provider can reclaim it at short notice when the demand for ordinary instances rises.",
    d: "Spare hosts are offered under a price or capacity-pool model. When ordinary capacity is needed, the placement system selects instances to reclaim, publishes an interruption notice through the metadata service and events, waits a short grace period and then stops or terminates them. Customers use diversified pools and checkpointing. The difficulty is choosing which instances to interrupt fairly and predictably, and ensuring reclaiming is fast enough to protect the capacity that was promised to ordinary customers.",
    k: ["Short fixed notice vs longer warning: reclaim is quick and capacity is available when promised; customers have little time to checkpoint.", "Price-based allocation vs capacity-pool signals: simple market logic; prices become volatile and hard to explain."],
    p: ["Many instances of one customer sit in the same pool and are reclaimed together, failing the entire job.", "The interruption notice is not delivered because the metadata service is busy, and work is lost with no warning."],
    v: "Fill a zone with interruptible instances, request ordinary capacity, and confirm notices arrive on every selected instance, termination occurs after the stated grace period, and the ordinary launch succeeds within its target time.",
    dep: ["capacity-inventory", "instance-metadata-service", "placement-scoring"]
  },
  "capacity-inventory": {
    s: "A continuously updated model of every host's total and free resources, health and failure domains, used by placement to decide where a machine can go.",
    d: "Each host registers its resources and reports usage through heartbeats. The inventory aggregates them per zone, rack and hardware class, tracks claims that are held but not yet started, and records which hosts are draining or broken. Placement reads a snapshot, so it is a cached view of reality and is stale by seconds. The difficulty is staleness and scale: tens of thousands of hosts changing constantly, with many placement decisions racing on the same view.",
    k: ["Central inventory vs each cell owning its hosts: a global view enables better packing; per-cell ownership bounds scale and failure.", "Eventually consistent view with claims to arbitrate vs strongly consistent view: no lock bottleneck; stale views cause retries on conflict."],
    p: ["An inventory that still counts a failed host's capacity sends launches to a machine that cannot take them.", "Free capacity looks sufficient in total but is scattered in pieces too small for large types."],
    v: "Compare the inventory's free capacity per host against the host's own report across the fleet, and confirm the difference stays within the claims in flight and the heartbeat interval.",
    dep: ["heartbeats-and-health", "resource-database", "host-registration"]
  },
  "placement-filters": {
    s: "The hard constraints that eliminate hosts which cannot run a request: not enough resources, wrong hardware, wrong zone, unhealthy or not allowed.",
    d: "Given a request, filters run in sequence and reduce the candidate set: enough free cores and memory, supports the type and image, right network and zone, not draining, not excluded by tenant policy or dedicated hardware rules. Filters are pure functions of the request and the inventory snapshot, which makes them testable. The hard part is performance, since the candidate set is huge and filters must be cheap, and explainability, since an empty result must say which filter removed the last hosts.",
    k: ["Cheap indexed filters first vs a fixed filter order: fastest elimination at scale; the ordering needs maintenance as the fleet changes.", "Return the reason for an empty set vs a generic capacity error: easier for operators to diagnose; may reveal fleet details to customers."],
    p: ["A new constraint silently excludes most hosts and the launch error rate climbs without a clear cause.", "Filters disagree with the host's own admission checks, so claims succeed centrally and fail on the host."],
    v: "Submit requests that each violate exactly one constraint and confirm placement returns no candidate and names that filter, and confirm every host that passes the filters also passes the host's own admission check.",
    dep: ["capacity-inventory", "instance-types"]
  },
  "placement-scoring": {
    s: "Ranks the hosts that passed the filters by how good a fit they are, trading packing efficiency against failure isolation and future flexibility.",
    d: "Scoring functions weigh things like how full the host would become, how many of the account's instances already share a rack, hardware age, power headroom and how well the remainder fits future requests. The best-scoring host or a random pick among the top few is chosen. Randomization avoids many concurrent requests choosing the same host. It is hard because the best bin-packing score is the worst failure-isolation choice, and a tuning change shifts fleet-wide behavior for months.",
    k: ["Pack tightly vs spread widely: tight packing frees whole hosts and saves power; spread limits the damage of a single host failure.", "Pick the single best vs random among the best: the best fills fastest; random avoids hot hosts and thundering conflicts."],
    p: ["A scoring tweak packs one customer's instances onto the same rack and a single power fault takes down the whole service.", "Every placement picks the same top host and conflicts retry in a loop."],
    v: "Replay a recorded week of launch requests through the scorer in simulation and compare utilization, per-account spread across racks and conflict rate against the current policy before changing any weight.",
    dep: ["placement-filters", "capacity-inventory"]
  },
  "placement-groups": {
    s: "Customer-specified rules about where instances sit relative to each other: close together for latency, or spread apart to limit shared failure.",
    d: "A group declares a strategy: cluster instances in the same network spine for low latency, spread them across racks or hosts, or partition them so that groups share no hardware. Placement honors the strategy as a filter and scoring input, and a launch that cannot satisfy it fails rather than violate it. The difficulty is capacity: a cluster group needs adjacent free space which may be lacking, and adding instances to an existing group later can fail even if the first launch succeeded.",
    k: ["Fail when the rule cannot be met vs best effort: customers can rely on the guarantee; they hit capacity errors at the worst time.", "Cluster for latency vs spread for resilience: cluster serves tightly coupled work; spread serves services that must survive a rack loss."],
    p: ["A cluster group grown in several steps fails on the last step because the original racks are full.", "Customers assume spread groups protect against a zone failure when they only cover hosts and racks."],
    v: "Create a spread group and launch more instances than there are racks; confirm each of the first set lands on distinct racks per the inventory and that the extra launch fails or follows the documented rule.",
    dep: ["placement-filters", "capacity-inventory", "availability-zones"]
  },
  "capacity-claims": {
    s: "A short-lived hold placed on a host's capacity when placement picks it, so racing requests cannot both take the last slot.",
    d: "After choosing a host, placement attempts a conditional write that subtracts the request's resources from the host's free capacity, tagged with a claim identifier and an expiry. If the write fails because capacity changed, placement retries with the next candidate. The host agent confirms the claim when it actually starts the machine, and expired claims are released. It is hard because claims are the only coordination between many parallel schedulers, and a leaked claim reduces capacity until the expiry sweep finds it.",
    k: ["Optimistic claims with retry vs a central serialized scheduler: scales out with no bottleneck; busy hosts cause conflict retries.", "Short claim expiry vs long: leaks heal quickly; slow launches may lose their claim and need to redo placement."],
    p: ["A crashed workflow leaves claims behind that are never released and capacity quietly disappears.", "A claim expires while the host is still preparing the image, and a second request takes the same slot."],
    v: "Fire many concurrent placements at a nearly full host and confirm exactly as many succeed as free slots exist, and that killing the workflow mid-claim returns the capacity within the expiry time.",
    dep: ["capacity-inventory", "resource-database"]
  },
  "defragmentation": {
    s: "Moves running or soon-to-run machines to consolidate scattered free capacity into whole slots that large types can use.",
    d: "Over time, differing departure times leave hosts partly full with unusable remainders. A background planner finds hosts that can be emptied, chooses moves that cost little, and either migrates instances live where supported or waits for them to end naturally while steering new work elsewhere. It must not disturb customers more than the benefit justifies. The difficulty is that moving a customer's instance is a risk with no direct return to them, so moves must be rare, careful and reversible.",
    k: ["Live migration to consolidate vs only placing smartly for new work: reclaims capacity quickly; adds risk and blackout for the customer's workload.", "Run continuously at low intensity vs in scheduled campaigns: steady state keeps the fleet healthy; scheduled windows are easier to supervise."],
    p: ["A migration storm saturates the network between hosts and degrades customer traffic.", "Defragmentation targets a host that a maintenance workflow is also draining, and instances bounce twice."],
    v: "Run a consolidation pass on a test zone and compare the count of hosts able to fit the largest type before and after, while confirming migrated instances show no longer than the documented pause.",
    dep: ["capacity-inventory", "maintenance-evacuation", "placement-scoring"]
  },
  "maintenance-evacuation": {
    s: "Empties a host of customer machines before planned maintenance or retirement, by migrating them or by scheduling a stop and restart elsewhere.",
    d: "Operations mark a host as draining, which removes it from placement. The planner then either live-migrates each instance to another host or notifies the customer of a scheduled event and restarts it later in a window. Hosts are returned once repaired and verified. Evacuating a rack means moving many instances at once while respecting every placement group rule. The difficulty is doing this at fleet scale without overloading destinations or breaking anti-affinity guarantees.",
    k: ["Live migrate vs scheduled reboot: no customer-visible restart; needs spare capacity and a hypervisor that supports it.", "Evacuate before maintenance vs repair in place with short downtime: customers see no interruption; the cost is spare capacity held in reserve."],
    p: ["Evacuations of several racks at once exhaust spare capacity and instances fail to relocate.", "A drained host that never gets re-enabled quietly shrinks capacity until a shortage is noticed."],
    v: "Drain a loaded test host and confirm every instance is running elsewhere with its placement-group rules intact and the host reports empty, before and after which the inventory matches reality.",
    dep: ["capacity-inventory", "host-lifecycle", "placement-groups"]
  },
  "virtual-networks": {
    s: "A customer's private, isolated network with its own address space, spanning the zones of a region on shared physical infrastructure.",
    d: "A virtual network is a resource with an address range, a set of subnets and attached gateways. The control plane stores it and allocates a network identifier used in encapsulation on the fabric. Traffic from two networks never mixes even if they use the same addresses. Address ranges may overlap across customers. The hard part is the scale of state: every host must know the mapping for every virtual interface in networks that have instances on it, and this information changes constantly.",
    k: ["Overlapping address spaces across tenants allowed vs forced uniqueness: customers can use familiar ranges; every mapping must be keyed by network identifier and connecting networks needs translation.", "A network spans all zones of a region vs one per zone: easy multi-zone design; the control plane must program state in every zone."],
    p: ["A customer's range overlaps an on-premises range, and routing to either fails once they are connected.", "A host holding mappings for a large network is slow to converge after a restart and drops packets."],
    v: "Create two networks with identical ranges and launch instances with the same addresses in both; confirm each pair communicates inside its network and cannot reach the other.",
    dep: ["network-controller", "tenant-isolation", "resource-model"]
  },
  "subnets-and-route-tables": {
    s: "Divisions of a virtual network that sit in a zone, and the routing rules that decide where each subnet's traffic goes.",
    d: "A subnet is a range inside the network bound to one zone. A route table maps destination ranges to targets such as local, a gateway, a peering connection or a specific interface. Each subnet associates with one table, and the most specific prefix wins. The controller compiles the tables into forwarding rules in each host's virtual switch. The difficulty is correctness of the compiled result under frequent edits and the blast radius of a bad route, which can cut off a whole subnet instantly.",
    k: ["Longest-prefix route selection vs explicit priorities: familiar and predictable; overlapping routes can be hard to reason about.", "Edits applied atomically across hosts vs rolling: no mixed behavior; atomicity across thousands of hosts is expensive and slow to achieve."],
    p: ["A default route replaced by mistake sends all traffic to a gateway that drops it, and the customer's subnet goes dark.", "Hosts converge on a route change at different times, creating a short period of asymmetric paths."],
    v: "Change a route in a populated subnet, probe connectivity every second from instances on several hosts, and confirm the traffic follows the new route everywhere within the convergence bound with no flapping.",
    dep: ["virtual-networks", "network-controller"]
  },
  "security-groups": {
    s: "Stateful, per-interface firewall rules written by customers that allow traffic by protocol, port and source, with everything else denied.",
    d: "A group is a set of allow rules that can reference address ranges or other groups, and interfaces belong to one or more groups. The controller expands group references into concrete address sets and programs them into the host's virtual switch, tracking connections so replies are allowed. Rules apply at the interface, so enforcement is distributed over every host. Difficulty arises from scale: references to large groups expand into very large rule sets, and each membership change must reach every host that has a member of any referencing group.",
    k: ["Stateful tracking vs stateless filtering: replies are allowed automatically and rules are simple; connection tables use memory and must be bounded.", "Group references vs only address ranges: rules follow membership as instances come and go; updates fan out to many hosts."],
    p: ["Opening a port to the whole internet for a test remains in place for years.", "A rule change reaches some hosts seconds before others, so a connection is allowed from one side and refused from the other."],
    v: "Add and remove an allow rule on a group of instances spread across hosts while probing continuously, and confirm every host starts and stops allowing traffic within the documented propagation time and unmatched traffic is dropped.",
    dep: ["network-controller", "virtual-interfaces"]
  },
  "virtual-interfaces": {
    s: "The virtual network cards attached to instances, each with addresses, group memberships and a place in a subnet, created and moved independently of the machine.",
    d: "An interface is its own resource: it has a primary address, optional secondary addresses, a hardware address, security groups and a source/destination check. It attaches to an instance on a specific host, which makes the host's virtual switch create a port and install forwarding state. Interfaces can be detached and attached elsewhere, keeping their addresses. The challenge is moving interface state quickly when instances migrate or fail over, and avoiding two interfaces briefly claiming one address.",
    k: ["Interfaces as separate resources vs part of the instance: addresses survive instance replacement and fail over; there is another lifecycle to leak and clean up.", "Address allocated by the control plane vs assigned by the guest: no conflicts and mappings known in advance; guests cannot pick their own address."],
    p: ["A detached but not deleted interface holds an address and quota and is forgotten.", "During failover the old and the new host both answer for the address until the old state is withdrawn."],
    v: "Move an interface with a secondary address from one instance to another and confirm the address answers from the new instance within the documented time and never from both at once.",
    dep: ["virtual-networks", "network-controller", "host-agent"]
  },
  "public-addresses": {
    s: "Internet-routable addresses owned by the provider that map onto instances' private addresses, with allocation, association and release as separate steps.",
    d: "The service holds a pool of public addresses, allocates one to an account, and associates it with an interface. Translation happens either on the host or in a gateway fleet that rewrites between the public and private address. Addresses can be static, staying with the account until released, or ephemeral. Because public addresses are finite and reputation matters, release and reuse need quarantine. The difficulty is correct translation state at every translator after a move, and abuse by previous owners.",
    k: ["Translation on the host vs on a gateway fleet: host-side avoids a choke point; gateways simplify the host but need capacity management.", "Quarantine released addresses vs reuse at once: new owners avoid inherited blocklists and stale traffic; fewer addresses are available."],
    p: ["A released address immediately given to a new customer still receives traffic meant for its old owner.", "Translation entries left on a gateway after a move send traffic to the wrong instance."],
    v: "Associate an address with an instance, move it to another, and confirm external probes reach only the new instance within the time bound, then release it and confirm the address does not answer.",
    dep: ["virtual-interfaces", "network-controller", "gateways-and-peering"]
  },
  "overlay-dataplane": {
    s: "The packet-forwarding layer that wraps each tenant packet in an outer header and carries it across the physical fabric to the destination host.",
    d: "The virtual switch on each host looks up the destination virtual address in a mapping table, wraps the packet with an outer header carrying the network identifier and the destination host's physical address, and sends it over the fabric. The receiver unwraps and delivers it to the right port. Mapping lookups are cached and fetched on demand from the mapping service. It is hard because it sits on every packet, so it must run at line speed, often with hardware offload, and keep working during control plane failure.",
    k: ["Pushing all mappings to every host vs fetching on demand: no first-packet delay; large state and slow convergence at scale.", "Encapsulation in software vs offloaded to network hardware: flexible and updatable; consumes host processor and adds latency."],
    p: ["A stale mapping cache sends packets to the old host of a migrated instance and they are dropped.", "A path with a smaller packet size limit drops large encapsulated packets because nothing accounts for header overhead."],
    v: "Send traffic between instances on different hosts and racks while migrating one, and confirm packet loss stays within the documented bound and throughput reaches the type's advertised rate.",
    dep: ["network-controller", "virtual-interfaces", "hypervisor-driver"]
  },
  "network-controller": {
    s: "Turns customers' network intent into per-host forwarding and firewall state, and keeps every host's virtual switch converged with it.",
    d: "The controller watches network resources, such as networks, subnets, routes, groups and interfaces, and computes for each host the exact rules and mappings it needs. It sends them to host agents, which acknowledge. It must handle bursts, such as a large group change, without delaying unrelated updates. State is sharded by network. The challenge is convergence at scale and correctness: it is a compiler from intent to forwarding, and a bug here changes the behavior of customer traffic everywhere at once.",
    k: ["Push model to hosts vs hosts pull from the controller: pushes converge fast; pulls survive controller restarts and are easier to rate limit.", "Sharded by network vs global computation: scales and limits blast radius; cross-network features such as peering need coordination between shards."],
    p: ["A large security group change triggers recomputation for thousands of hosts and delays an unrelated customer's update.", "A controller bug emits an empty rule set and all hosts apply it, cutting traffic fleet-wide."],
    v: "Make a representative change, then compare every host's installed rule set against the rule set computed from the stored intent and confirm they are identical, with time to converge under the target.",
    dep: ["resource-database", "message-bus", "host-agent", "leader-election"]
  },
  "gateways-and-peering": {
    s: "Components that connect virtual networks to the internet, to each other and to customer data centers, with routing and policy at each boundary.",
    d: "An internet gateway handles translation and routing for public traffic. Peering joins two networks so they exchange private traffic, requiring nonoverlapping ranges and consent from both owners. Transit and private-link style services let many networks connect through a hub or expose one service privately into another network. Customer links arrive over encrypted tunnels or dedicated circuits. The challenge is routing: propagating routes between systems without loops or leaks, and sizing shared gateway fleets for the largest customer.",
    k: ["Direct peering between pairs vs a transit hub: peering is simple and cheap; the number of connections grows quadratically as networks multiply.", "Gateway fleets shared by many customers vs dedicated: efficient and elastic; a heavy tenant can affect others without careful limits."],
    p: ["A route leaked across a peering connection exposes a private network to one that was not meant to reach it.", "A shared gateway saturates from one tenant's traffic and other tenants see drops."],
    v: "Peer two networks, send traffic in both directions, then remove one side's consent and confirm traffic stops in both directions within the bound and no route to the other network remains.",
    dep: ["subnets-and-route-tables", "network-controller", "tenant-isolation"]
  },
  "virtual-load-balancer": {
    s: "A managed service that spreads incoming connections or requests across a pool of instances, checking their health and adding capacity as traffic grows.",
    d: "The control plane stores listeners, rules and target pools, and provisions a fleet of proxy or forwarding nodes in the customer's network, scaling it with load. Nodes check target health and remove failing targets. Some operate on connections and others on HTTP requests with routing rules. Targets register and deregister as autoscaling changes the group. The difficulty is draining connections on deregistration, scaling the fleet before a spike arrives, and keeping its own addresses stable while its nodes churn.",
    k: ["Connection-level balancing vs request-level: fast and protocol-agnostic; request-level allows routing by content and richer observability at higher cost per request.", "Pre-scaled capacity vs reactive scaling: absorbs sudden spikes; costs money while idle and still fails beyond its prewarmed headroom."],
    p: ["A sudden spike outruns scaling of the balancer nodes and requests fail until it catches up.", "Deregistered targets are removed before in-flight requests finish and users see aborted responses."],
    v: "Register and deregister targets under steady load and confirm no request fails during draining, and that a failed target is removed within the health-check interval and returns when it recovers.",
    dep: ["virtual-networks", "security-groups", "autoscaling-groups", "public-addresses"]
  },
});
