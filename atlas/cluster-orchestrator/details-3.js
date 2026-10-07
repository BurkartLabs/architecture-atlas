// Details for the cluster orchestrator plate, part 3: networking, storage and configuration, API server.
ATLAS.details("cluster-orchestrator", {
  "services": {
    s: "A stable name and selector for a changing set of workload units, so clients address one thing while the backends behind it come, go and move.",
    d: "A service object holds a label selector, ports and a type. A controller finds matching ready units and records their addresses as endpoints; clients use the service's name, which cluster DNS resolves, and traffic is spread across the endpoints. Variants give a virtual address, a node port, a cloud load balancer, an alias to an external name, or no virtual address at all so DNS returns the units directly. The hard part is that the selector is the only link: a typo matches nothing and the service silently has no backends.",
    k: ["Label-selector membership versus explicit address lists: selectors follow the workload automatically, but a wrong label silently removes backends.", "Virtual address versus direct unit addresses through DNS: a virtual address hides churn from clients, while direct addresses let clients like databases choose members themselves."],
    p: ["A selector that matches nothing produces a service that resolves but refuses every connection.", "Clients that cache resolved addresses keep using units that no longer exist."],
    v: "Create a service for three ready units, then fail one readiness probe. Confirm the endpoint list drops that unit within seconds and a loop of requests through the service name never reaches it.",
    dep: ["endpoint-slices", "virtual-service-ips", "cluster-dns", "workload-unit"]
  },
  "virtual-service-ips": {
    s: "Cluster-internal addresses allocated to services that belong to no machine and are translated by each node to one of the service's real backends.",
    d: "On creation, a service receives an address from a reserved range, tracked in the store to prevent duplicates. No interface owns it; instead each node's proxy installs rules that rewrite packets sent to the address and port toward a chosen backend, and connection tracking keeps a flow on its backend. The range is fixed at cluster creation. The hard part is that translation happens on the client's node: rule sets grow with services and endpoints, and large clusters hit programming time and lookup costs.",
    k: ["Virtual addresses with per-node translation versus a central proxy: per-node translation scales and has no single choke point, but every node carries the full rule set.", "Fixed address range versus growing on demand: a fixed range keeps allocation simple, but runs out in clusters with many services."],
    p: ["Exhausting the address range blocks creation of new services with an unclear error.", "Pinging a service address fails because only the configured ports are translated."],
    v: "Create a service and capture traffic from a client to its address. Confirm the destination is rewritten to a backend address on the first packet and subsequent packets in the same connection reach the same backend.",
    dep: ["node-network-proxy", "services", "consensus-backed-store"]
  },
  "endpoint-slices": {
    s: "Objects that list the addresses, ports and readiness of the backends of a service, split into bounded-size slices so changes scale to thousands of backends.",
    d: "A controller matches a service's selector to workload units and writes their addresses into slices of at most about a hundred entries, with topology and readiness per entry. Proxies, DNS and gateways watch the slices instead of a single large list. A change to one backend updates only one slice. The hard part is the cost of churn: each unit update rewrites objects that are sent to every node, and the previous one-object design made rolling updates of large services a major source of control-plane load.",
    k: ["Sliced lists versus one object per service: slices keep each update small and bounded, while a single object grows without limit and is resent in full on every change.", "Readiness and termination state in each entry versus removal only: extra state lets proxies drain gracefully, but consumers must handle more cases."],
    p: ["A large rolling update produces a burst of slice changes that every node must process at once.", "A consumer that ignores terminating entries cuts live connections during shutdown."],
    v: "Scale a service from ten to five hundred backends and confirm the endpoints split across multiple slices, that adding one backend changes exactly one slice, and that a node's proxy updates within the target delay.",
    dep: ["services", "watch-streams", "health-probes", "informers-and-caches"]
  },
  "cluster-dns": {
    s: "A name service inside the cluster that resolves service and workload names to addresses, following the API's changing view of what exists.",
    d: "A DNS server runs as ordinary workloads, watching services and endpoint slices and answering queries from that cache. Names follow a pattern of service, namespace and a cluster suffix; headless services return the individual backends, and ordered sets get per-member names. Each workload's resolver config points to the service address, with search paths so short names work. The hard part is load and behavior: search paths multiply queries per lookup, short names resolve in surprising ways, and DNS is a single dependency for nearly every call.",
    k: ["Short names via search paths versus fully qualified names only: search paths make configuration convenient, but multiply lookups and let a name resolve to a different service than intended.", "Central DNS workloads versus per-node caches: per-node caches cut latency and conntrack pressure, at the cost of another daemon on every node."],
    p: ["Search-path expansion turns each external lookup into several failed internal queries, overloading DNS.", "A DNS outage fails nearly every service call, even though the backends are healthy."],
    v: "Resolve a service name, a headless service name and a member of an ordered set from inside a workload. Confirm each answer matches the current endpoints, and that the answer changes within seconds after a backend is removed.",
    dep: ["endpoint-slices", "services", "informers-and-caches"]
  },
  "node-network-proxy": {
    s: "A per-node component that programs the node's packet filtering or load-balancing rules so traffic to service addresses reaches healthy backends.",
    d: "It watches services and endpoint slices and translates them into kernel rules: chains of packet-filter rules, a kernel virtual-server table, or compiled programs attached to network hooks. Backend choice is random or round-robin; session affinity is optional. It also opens node ports and handles traffic that arrives from outside. The hard part is rule programming at scale: sequential rule lists make lookups and updates slow, and some data planes make connection reuse across backend changes inconsistent.",
    k: ["Kernel-level rewriting versus a user-space proxy: kernel rules are fast and add no hop, but are hard to observe and debug, while user-space proxying is observable and slower.", "Full rule resync versus incremental updates: full resync is simple and self-healing, but takes seconds in large clusters and can cause stalls."],
    p: ["Rule programming lag after a mass endpoint change sends traffic to backends that no longer exist.", "Source address translation hides client addresses, which breaks IP-based rules in applications."],
    v: "Change a service's backends and measure from a client node how long until new backends receive traffic and old ones stop. Confirm rule counts on the node match the endpoint count.",
    dep: ["endpoint-slices", "virtual-service-ips", "informers-and-caches"]
  },
  "ingress-controllers": {
    s: "Proxies running in the cluster that read ingress objects and route external HTTP and TLS requests to services by host and path.",
    d: "An ingress object maps hostnames and paths to services and names a TLS secret. A controller for the chosen class watches these, generates proxy configuration, reloads it and often fronts itself with a cloud load balancer. Annotations carry features the base object lacks, such as rewrites and rate limits. The hard part is portability and blast radius: annotations differ per implementation, one shared proxy serves every team's routes, and a single invalid object can break configuration reload for all.",
    k: ["One shared ingress for all routes versus one per team: sharing saves addresses and cost, but concentrates failure and configuration conflicts.", "Annotation-based extensions versus a richer standard model: annotations are quick to add, but non-portable and unvalidated by the API."],
    p: ["A syntax error in one team's route stops configuration reload and freezes routing for every host.", "Two ingress objects claiming the same host and path give unpredictable results."],
    v: "Create an ingress with a host, a path prefix and a TLS secret. Confirm an HTTPS request with that host reaches the right service, and that a request for an unknown host receives the default response.",
    dep: ["services", "secrets", "external-load-balancers", "informers-and-caches"]
  },
  "gateway-resources": {
    s: "A role-oriented set of resources that separates infrastructure owners, who define listeners and addresses, from application teams, who attach routes with matching, splitting and filtering.",
    d: "A gateway class names an implementation, a gateway defines listeners with ports, protocols and certificates, and route objects for HTTP, TLS and other protocols attach to them with match rules, header changes, redirects and weighted backends. Namespaces and policies control who may attach to which gateway. Status on each object reports acceptance and conflicts. The hard part is that features outside the core have to be added through typed policies or extensions, and implementations support different subsets.",
    k: ["Split gateway and route resources versus a single ingress object: the split lets platform and application teams own separate pieces, at the cost of more objects and more cross-references.", "Typed extension points versus free annotations: typed extensions are validated and discoverable, but slower to standardize."],
    p: ["A route attached to a gateway it was never meant for exposes an internal service.", "Relying on an implementation-specific extension makes moving to another implementation a rewrite."],
    v: "Attach a route with a ninety-ten weighted split to a gateway. Confirm about ten percent of requests reach the second backend, and a route from an unauthorized namespace is reported as not accepted.",
    dep: ["services", "secrets", "namespaces", "external-load-balancers"]
  },
  "external-load-balancers": {
    s: "Integration that provisions an infrastructure load balancer for a service of the right type and keeps its backends and health checks in sync with the cluster.",
    d: "A cloud-facing controller watches services requesting an external address, calls the infrastructure API to create a balancer and forwarding rules, and registers either the nodes through node ports or the units directly. It writes the assigned address into the service's status. It cleans up on deletion using a finalizer. In environments with no cloud, an address-announcing component fills the same role. The hard part is client source address preservation and health checking, since nodes without a local backend must be removed or traffic takes an extra hop.",
    k: ["Balancing to nodes versus directly to workload addresses: nodes work anywhere, while direct targets avoid an extra hop and keep source addresses, but need network integration.", "Preserving client address with local-only routing versus spreading evenly: local-only keeps the address and avoids a hop, but uneven backend counts make load uneven."],
    p: ["Deleting a cluster without deleting its services leaves billed load balancers behind.", "Local-only routing sends all traffic of a node to its one backend, so load is uneven."],
    v: "Create a load-balanced service and confirm the status receives an address that answers requests. Delete the service and confirm the infrastructure balancer and rules are removed within the expected time.",
    dep: ["cloud-provider-interface", "services", "finalizers", "node-network-proxy"]
  },
  "network-policy": {
    s: "Declarations of which workloads may exchange traffic, selected by labels and namespaces, enforced by the network layer and denying everything not allowed once selected.",
    d: "A policy selects units by label and lists allowed ingress and egress by peer selector, namespace selector, address block and port. Units not selected by any policy accept all traffic; once selected, only listed traffic is allowed, and policies add. The API only stores the rules; the workload network plugin translates them into filters and must support the feature. The hard part is that unenforced policies look applied: a cluster whose plugin ignores them gives false assurance.",
    k: ["Default allow with opt-in policies versus default deny: default allow is easy to adopt, but needs a deliberate deny-all policy in each namespace to be safe.", "Label-based peers versus address-based rules: labels follow workloads as they move, while address rules suit external endpoints but go stale."],
    p: ["Policies are stored without error on a network plugin that does not enforce them.", "A deny-all egress policy breaks DNS lookups because the resolver was never allowed."],
    v: "Apply a deny-all ingress policy to a namespace and confirm connection attempts from other units time out, then add an allow rule for one client label and confirm only that client connects.",
    dep: ["network-plugin-interface", "namespaces", "overlay-and-routing"]
  },
  "volumes": {
    s: "Directories made available to containers in a workload unit, backed by temporary scratch space, host paths, network storage, injected configuration or persistent claims, with a lifetime tied to the unit or beyond it.",
    d: "A unit declares volumes and each container mounts them at paths. Empty-directory volumes live as long as the unit and survive container restarts; projected volumes combine config, secrets and tokens; claim-backed volumes outlive the unit. The node agent mounts everything before starting containers and unmounts after they stop. Sharing between containers uses the same volume. The hard part is the variety: lifetime, sharing, ownership and security behavior differ greatly between volume types, and mistakes lose data silently.",
    k: ["Ephemeral volumes versus persistent claims: ephemeral volumes are simple and fast and vanish with the unit, while claims survive but tie the workload to storage and its zone.", "Direct host paths versus managed volumes: host paths are easy and fast, but break portability and expose the node's filesystem."],
    p: ["Data written to a unit's scratch directory disappears when the unit moves to another node.", "Host path mounts give containers access to node files and credentials."],
    v: "Write data to a scratch volume, restart one container and confirm the data remains, then delete the unit and confirm it is gone. Repeat with a claim-backed volume and confirm the data survives.",
    dep: ["workload-unit", "node-volume-manager", "persistent-volume-claims", "config-maps"]
  },
  "persistent-volume-claims": {
    s: "A workload's request for storage of a given size, access mode and class, which the system binds to a matching volume or provisions on demand.",
    d: "A claim states capacity, access modes such as single-node or many-node, and optionally a class or existing volume. A controller binds it one-to-one to a suitable persistent volume or triggers provisioning. The workload refers only to the claim, so manifests do not name infrastructure. Claims can be expanded if the class allows. Deleting a claim triggers the volume's reclaim policy. The hard part is lifecycle: claims outlive workloads, and a retained or deleted volume decision determines whether data survives accidental deletion.",
    k: ["Claims abstracting storage versus naming volumes directly: claims separate application intent from infrastructure, but add a binding step that can fail or stay pending.", "Delete versus retain reclaim policy: delete avoids leaks, while retain protects data from accidental claim deletion and needs manual cleanup."],
    p: ["A claim stuck pending because of a class typo leaves the workload unschedulable with a vague message.", "Deleting a claim with a delete reclaim policy destroys the underlying disk and data."],
    v: "Create a claim and confirm it binds to a volume of at least the requested size and access mode. Delete it with each reclaim policy and confirm the volume is either removed or retained in a released state.",
    dep: ["persistent-volumes", "storage-classes", "volume-attach-and-bind", "resource-model"]
  },
  "persistent-volumes": {
    s: "Cluster-level objects that describe a piece of real storage, such as a network disk, with its capacity, access modes, reclaim policy and topology, independent of any workload.",
    d: "A volume is created by an administrator or a provisioner and records the plugin driver, the identifier of the real volume and where it can be attached. It moves through available, bound, released and failed. Node affinity states the zone or machines that can reach it. Unlike claims, volumes are not namespaced. The hard part is the mismatch between the object and the real disk: the two can diverge when a disk is deleted outside the cluster or a volume's identifier is reused.",
    k: ["Static pre-created volumes versus dynamic ones: static gives administrators full control over what exists, while dynamic removes manual work.", "Node affinity on the volume versus none: affinity makes the scheduler place the workload where the disk is reachable, but restricts failover to that zone."],
    p: ["A disk deleted in the infrastructure leaves a volume object that still claims to be bound and healthy.", "A volume in one zone makes any workload using it unschedulable when that zone is down."],
    v: "Create a volume and claim, write data, then inspect the volume's status, driver identifier and node affinity. Confirm the affinity matches the zone of the real disk reported by the infrastructure.",
    dep: ["storage-plugin-interface", "volume-attach-and-bind", "resource-model"]
  },
  "storage-classes": {
    s: "Named profiles of storage, each naming a provisioner, its parameters, binding mode, reclaim policy and expansion support, so users request quality without naming technology.",
    d: "A class pairs a driver with parameters such as disk type, replication or encryption, and policies for when binding happens and what happens on release. A claim names a class, or the default applies. Different classes expose different performance or cost tiers. A cluster usually offers several. The hard part is that parameters are opaque to the cluster and immutable once volumes exist, so changing a class does not change existing volumes, and a wrong default class affects every claim that omits one.",
    k: ["A default class versus requiring an explicit one: a default makes simple cases easy, but surprises users who omit it and get costly or non-redundant storage.", "Immediate versus wait-for-consumer binding: waiting picks a volume where the workload will run, while immediate can create a disk in a zone the workload cannot use."],
    p: ["Parameters edited after volumes exist change nothing for those volumes, and operators believe they did.", "A default class with delete reclaim policy removes data when developers delete claims."],
    v: "Create claims against two classes and confirm the resulting volumes have the characteristics each class names, such as type and size. Confirm a claim with no class receives the one marked default.",
    dep: ["dynamic-provisioning", "storage-plugin-interface", "resource-model"]
  },
  "dynamic-provisioning": {
    s: "Creation of real storage on demand when a claim appears, by calling an external provisioner that makes the disk and the matching volume object.",
    d: "A provisioner watches unbound claims for its class, creates the volume in the storage system, and writes the volume object with a reference back to the claim. With wait-for-consumer binding it delays until the scheduler has picked a node, then creates the disk in that node's zone. Failures are retried with backoff and shown as events. The hard part is cleanup and idempotency: a crash after creating the disk but before recording it leaks storage, and a retried create must not make two disks.",
    k: ["External provisioner per storage system versus built-in code: external provisioners release independently and support any backend, but add components that must run and be upgraded.", "Create on claim versus wait for scheduling: waiting avoids stranded zonal disks, while eager creation makes claims bind faster."],
    p: ["A provisioner crash between creating the disk and writing the volume object leaks a billed disk.", "A storage quota error repeats silently, leaving claims pending for hours."],
    v: "Create a claim, confirm the provisioner creates one disk in the storage system and one volume object with its identifier. Kill the provisioner mid-create and confirm the retry produces no second disk.",
    dep: ["storage-classes", "storage-plugin-interface", "persistent-volume-claims", "reconciliation-loops"]
  },
  "volume-attach-and-bind": {
    s: "The controllers and checks that pair claims with volumes, and attach network disks to the node chosen for a workload before it can mount them.",
    d: "A binding controller matches claims to volumes by size, class, access mode and selector, writing references on both. When a workload is scheduled, an attach controller asks the storage system to attach the disk to that node and records it in an attachment object; the node agent then formats if needed and mounts it. Single-node access modes mean a disk must detach from the old node first. The hard part is failure: a disk still attached to a dead node cannot attach elsewhere until detached.",
    k: ["Controller-managed attach versus attach by the node agent: central attachment can detach disks from failed nodes, while node-side avoids a round trip but cannot act on a dead node.", "Early binding versus topology-aware late binding: late binding places the disk where the work runs, but delays readiness."],
    p: ["A node crash leaves a disk attached, and the replacement workload waits minutes for forced detach.", "Two claims race for one volume until the loser stays pending without a clear reason."],
    v: "Run a single-node-access workload, then power off its node. Confirm the replacement workload on another node waits for the detach, then attaches and mounts the same volume with data intact.",
    dep: ["persistent-volume-claims", "persistent-volumes", "storage-plugin-interface", "node-volume-manager"]
  },
  "storage-plugin-interface": {
    s: "A standard remote-procedure interface between the cluster and storage drivers, defining create, delete, attach, mount, snapshot and expand operations outside the core.",
    d: "A driver runs as a controller service that handles provisioning, attach and snapshot calls, and a node service that stages and publishes volumes on each machine. Sidecar components translate cluster objects into driver calls and back. The interface reports capabilities so the cluster knows what each driver supports. Drivers are shipped independently of the cluster release. The hard part is the contract: calls must be idempotent and timeouts ambiguous, since the cluster cannot tell if a create that timed out succeeded.",
    k: ["Out-of-process driver interface versus in-tree plugins: out-of-process lets vendors release independently and keeps the core small, but needs sidecars, registration and permissions to operate.", "Capability negotiation versus assuming all features: negotiation allows simple drivers, but every feature needs a code path for absence."],
    p: ["A non-idempotent create returns an error on retry because the volume already exists, and the claim sticks.", "A driver upgrade on nodes disrupts existing mounts if its node service restarts carelessly."],
    v: "Install a driver, provision, attach, mount, write, snapshot and delete a volume, and confirm each step reaches the storage system. Repeat a create call and confirm it returns the same volume, not a second one.",
    dep: ["node-agent", "api-server", "runtime-classes"]
  },
  "config-maps": {
    s: "Objects holding non-secret configuration as key-value pairs, which workloads consume as environment variables, command arguments or files, separately from the image.",
    d: "A config map stores strings or small binary values up to a size limit. A unit references it by name to set environment variables, or mounts it as a volume where each key becomes a file. Mounted files are updated by the node agent after a delay when the object changes, while environment variables are fixed at container start. Immutable variants reduce watch load. The hard part is propagation: applications must reload or restart to see changes, and a bad value pushed to all replicas at once is an outage.",
    k: ["Mounted files versus environment variables: files can update live, but need the application to reload, while variables are simple and require a restart to change.", "Mutable versus immutable config: mutable allows live edits, but one bad edit hits every consumer, and immutable forces versioned names and a rollout."],
    p: ["Editing a config map changes nothing for running containers that read variables, though operators assume it did.", "A shared config map edited for one service breaks every other service that mounts it."],
    v: "Mount a config map as a file and as a variable, edit a value, and confirm the file changes within the sync period while the variable stays unchanged until the container restarts.",
    dep: ["volumes", "workload-unit", "api-server"]
  },
  "secrets": {
    s: "Objects holding small sensitive values such as passwords, tokens and keys, delivered to workloads as files or variables with narrower access control than ordinary configuration.",
    d: "A secret is stored like other objects but treated specially: node agents receive only secrets for units on their node, mounted values live in memory-backed storage, and access is separately granted and audited. Types cover registry credentials, TLS pairs and tokens. Encoding is not protection; protection comes from encryption at rest, access policy and minimal exposure. The hard part is everything around them: anyone who can create a unit in a namespace can mount its secrets, and values leak through logs, environment dumps and backups.",
    k: ["Cluster-stored secrets versus an external secret manager synced in: native secrets are simple, while an external store gives rotation and better audit, but adds a sync component.", "Mounted files versus environment variables: files can rotate and avoid appearing in process dumps, at the cost of application support for reading them."],
    p: ["Base64 encoding is mistaken for encryption, and secrets sit readable in backups and manifests in version control.", "Granting permission to create workloads in a namespace implicitly grants read access to its secrets."],
    v: "Create a secret and mount it. Confirm it appears in memory-backed storage on only the node running the unit, that another namespace's account cannot read it, and that it is encrypted in the stored data.",
    dep: ["secret-encryption-at-rest", "rbac", "volumes", "audit-logging"]
  },
  "secret-encryption-at-rest": {
    s: "Encryption of selected resource types before they are written to the store, using keys held outside it, so a leaked store file or backup does not expose secrets.",
    d: "The API server encrypts configured resource types with a data key through a provider, which may use a local key file or call an external key management service that wraps data keys. A header on each stored value names the provider and key, so keys can be rotated: new writes use the new key and old data is rewritten by touching every object. The hard part is key availability and rotation, since losing the key makes data unreadable, and unrewritten data stays under the old key.",
    k: ["External key service versus a local key file: an external service keeps keys off the control plane and adds audit, but makes every secret read depend on its availability.", "Encrypt only secrets versus all resources: secrets-only is cheap, while encrypting everything protects more at higher cost per read and write."],
    p: ["Rotating the key without rewriting stored objects leaves old data readable only with the old key, which then gets deleted.", "A key service outage prevents the API server from reading any secret, and workloads fail to start."],
    v: "Write a secret, read its raw bytes directly from the store and confirm they are ciphertext with a provider header. Rotate the key, rewrite all secrets, remove the old key and confirm every secret is still readable.",
    dep: ["consensus-backed-store", "api-server", "secrets"]
  },
  "api-server": {
    s: "The stateless front end that authenticates, authorizes, admits, validates and stores every request, and serves lists and watches of all resources to every other component.",
    d: "A request passes through authentication, authorization, mutating admission, schema validation, validating admission, then is serialized and written to the store. Reads are served from the watch cache where possible. It serves discovery, health checks and many resource types from one generic implementation. Several replicas run behind a load balancer, since the only state is in the store. The hard part is that it is the shared bottleneck: all controllers, node agents and users go through it, and its fairness, caching and timeouts decide how overload spreads.",
    k: ["Single gateway to the store versus components writing to it directly: a gateway centralizes validation, security and caching, but is a scaling chokepoint every client shares.", "Stateless replicas versus sticky sessions: stateless replicas allow simple load balancing and rolling restarts, but watch resumption must work across any replica."],
    p: ["A misbehaving client listing every object in a loop consumes server memory and starves other clients.", "A slow admission webhook increases latency for every write of the types it covers."],
    v: "Send a create request with a valid and an invalid body through a replica. Confirm the valid object is in the store and readable via any other replica, and the invalid one is rejected with a structured error before storage.",
    dep: ["authentication", "rbac", "admission-chain", "schema-validation", "consensus-backed-store", "watch-cache"]
  },
  "resource-model": {
    s: "The uniform shape of every object: a type, a name and namespace, metadata such as labels and versions, a desired-state section and an observed-state section.",
    d: "Each resource has a group, version and kind, an immutable unique id, a name unique within its scope, labels for selection, annotations for free-form data and a resource version. Types are either namespaced or cluster-scoped and are exposed at predictable paths with standard verbs. Because all types share the shape, generic clients, caches, access control and tooling work for built-in and custom types alike. The hard part is that the model is deliberately lowest common denominator: relations between objects are only references by name or label.",
    k: ["Uniform generic resource shape versus bespoke endpoints per feature: uniformity lets one set of machinery serve everything, at the cost of weak typing across relationships.", "Labels for loose grouping versus explicit foreign keys: labels allow flexible selection and many-to-many relations, but have no referential integrity."],
    p: ["Using annotations as an unvalidated configuration channel creates behavior that no schema documents.", "References by name break silently when the target is deleted and recreated."],
    v: "Fetch any resource in raw form and confirm it has type metadata, name, namespace, unique id, labels, resource version, spec and status. Confirm the same list and watch verbs work on a built-in and a custom type.",
    dep: ["schema-validation", "api-versioning"]
  },
  "declarative-specs": {
    s: "Objects that state the desired end state rather than the steps, so users submit what should exist and the system works out how to make it so.",
    d: "A user applies a manifest describing replicas, images, ports and policies. The API records it as the object's spec; controllers do the work and may take minutes or retry through failures. Applying the same manifest twice has the same result. Specs can be kept in version control and diffed. The hard part is that declarative submission hides the process: failures show up as status or events after the fact, and some changes, such as one needing ordered steps, fit poorly.",
    k: ["Declarative end state versus imperative commands: declarative is idempotent and reviewable, but acceptance of a spec does not mean the state was reached.", "Full-object replace versus patch or apply semantics: replace is simple and complete, while patch avoids clobbering fields owned by other actors."],
    p: ["A successful apply is mistaken for a successful rollout, when controllers have not yet acted or have failed.", "Specs mutated by defaulting and other controllers differ from the manifest, making diffs noisy."],
    v: "Apply a manifest twice and confirm the second apply reports no change and does not restart any workload. Edit one field and confirm only the controllers owning that field act.",
    dep: ["resource-model", "desired-vs-observed-state", "server-side-apply"]
  },
  "desired-vs-observed-state": {
    s: "The split of each object into a spec written by users and a status written by controllers, so intent and reality are stored side by side and compared continuously.",
    d: "The spec is the desired state and is set by clients. Status is the observed state: ready replicas, conditions, assigned addresses, the generation last processed. Status is a separate subresource with its own access control, so a user cannot claim an outcome and a controller cannot rewrite intent. A generation counter increments on spec change, and controllers record which generation they observed. The hard part is interpretation: status can be stale, partial or conflicting, and a condition alone says little without its timestamp and generation.",
    k: ["Status as a separate subresource versus one writable object: separation enforces who may write what, but needs two update paths and permissions.", "Conditions list versus single phase enum: conditions are extensible and independent, but consumers must combine them to decide overall health."],
    p: ["Treating status as truth without checking the observed generation reads outdated results as current.", "A controller and a user both writing the same field cause endless overwriting."],
    v: "Change a deployment's template and watch the generation increment, then confirm the status's observed generation catches up, with conditions reporting progress and the ready count reaching the desired count.",
    dep: ["resource-model", "reconciliation-loops", "api-server"]
  },
  "api-versioning": {
    s: "A scheme in which each resource group serves several versions at once with stability levels, and the server converts between them while storing a single one.",
    d: "Versions are named by maturity, from experimental through beta to stable. The server stores each object in a chosen storage version, and converts to whichever version a client requests, using an internal hub representation to avoid pairwise conversions. Fields are added, not changed in meaning. Deprecated versions emit warnings before removal. The hard part is round-tripping: converting to an older version and back must not lose data, so unknown fields are preserved in annotations or defaults carefully.",
    k: ["Multiple served versions with server-side conversion versus one version with breaking changes: conversion lets clients migrate gradually, but doubles testing and conversion code.", "Beta-level features on by default versus off: on by default speeds feedback, but turns experiments into dependencies that are hard to remove."],
    p: ["A conversion that drops a field loses data when a client updates through an older version.", "A beta API left on in production becomes load-bearing and then is removed on schedule."],
    v: "Create an object at the older version and read it at the newer one, update through the older one and confirm no field is lost. Request a deprecated version and confirm a warning header is returned.",
    dep: ["resource-model", "consensus-backed-store"]
  },
  "schema-validation": {
    s: "Checks that an object's fields have the right types, ranges and formats and that required fields exist, before it is stored.",
    d: "Built-in types are validated by code; custom resources by a structural schema that supports types, enums, bounds, patterns and cross-field rules written in an expression language. Unknown fields are pruned or rejected, and defaults are filled in. Validation of updates can compare old and new, which allows rules like immutable fields. The hard part is evolution: tightening a rule makes already stored objects invalid, so the next update to them fails until they are fixed.",
    k: ["Declarative schema rules versus validating webhooks: schema rules run in-process with no extra network dependency, but cannot consult other objects.", "Rejecting unknown fields versus pruning silently: rejecting catches typos early, while pruning allows forward compatibility but hides mistakes."],
    p: ["A typo in a field name is silently pruned, and the setting the author thought they made does nothing.", "Tightened rules block updates to existing objects that stored data once satisfied."],
    v: "Submit objects with a wrong type, a missing required field, an out-of-range value and an unknown field. Confirm each is rejected or pruned as documented with a path-specific error, and nothing invalid is stored.",
    dep: ["resource-model", "api-versioning"]
  },
  "watch-streams": {
    s: "Long-lived requests that stream every change to a collection after a given version, letting clients stay up to date without polling.",
    d: "A client lists, gets a resource version, then opens a watch from that version. The server pushes added, modified and deleted events in order, with periodic bookmarks that advance the version. If the client falls behind past the retained history, it receives a too-old error and must relist. Filters by label and field cut traffic. The hard part is scale: tens of thousands of watchers each need ordered delivery, so the server serves them from a shared cache with per-watcher buffers, and slow watchers must be terminated.",
    k: ["Push streams with resume versions versus polling: streams cut latency and load, but need resumption handling and relist logic on gaps.", "Terminating slow watchers versus buffering without limit: termination protects the server, but forces the client to relist, a heavy operation."],
    p: ["A client that does not handle the too-old error loops forever or silently stops getting updates.", "Mass reconnection after a server restart causes a burst of full lists."],
    v: "Open a watch, create and delete an object, and confirm ordered added and deleted events arrive. Disconnect, change the object, reconnect from the last version and confirm the missed event is delivered.",
    dep: ["watch-cache", "resource-versions", "consensus-backed-store"]
  },
  "resource-versions": {
    s: "An opaque version stamped on every object by the store, used for ordering, for resuming watches and for optimistic concurrency on updates.",
    d: "Each write gets a new version derived from the store's global revision. Updates may carry the version they were based on, and the server rejects the write with a conflict if the object has changed since. Lists return a collection version from which a watch can start. Clients must treat it as opaque and compare only for equality. The hard part is that the versions are not meaningful for ordering across types in all cases, and reads may be served at older versions from the cache unless a quorum read is demanded.",
    k: ["Optimistic concurrency with retry versus locks: no locks and good throughput under low contention, but contended objects cause conflict retries that every writer must handle.", "Opaque versions versus documented numeric ordering: opacity lets the store change its implementation, but denies clients useful ordering."],
    p: ["A writer that retries blindly on conflict without re-reading overwrites another actor's change.", "Reading from a cache at an old version after a write returns data older than the write."],
    v: "Read an object, update it from another client, then try to update the first copy with its original version. Confirm the write is rejected with a conflict and the object keeps the other client's change.",
    dep: ["consensus-backed-store", "watch-cache"]
  },
  "server-side-apply": {
    s: "An update method where the server tracks which actor owns each field, merges declared intent from many actors and reports conflicts instead of overwriting.",
    d: "A client sends the fields it cares about together with a manager name. The server records ownership per field in object metadata, merges using the schema's rules for lists and maps, and rejects changes to fields held by another manager unless forced. Removing a field from a later apply deletes it if that manager owned it. The hard part is shared fields: list merge keys must be right, and ownership transfers when a different tool changes a field.",
    k: ["Field ownership tracking versus whole-object last-write-wins: ownership lets many tools and controllers cooperate on one object, at the cost of metadata and conflict handling.", "Forcing conflicts versus failing them: forcing resolves disputes automatically, but silently takes fields from another manager."],
    p: ["A bad merge key on a list makes entries duplicate or replace each other unexpectedly.", "Forcing an apply takes over a field from an autoscaler, which then fights back."],
    v: "Apply the same object from two managers with different fields, and confirm both sets persist with separate owners. Change one manager's field from the other and confirm a conflict is returned.",
    dep: ["resource-model", "schema-validation", "api-server"]
  },
  "priority-and-fairness": {
    s: "A request scheduler in the API server that classifies requests into priority levels and flows and queues them fairly, so one noisy client cannot starve the rest.",
    d: "Rules match requests by user, resource and verb to a flow schema, which assigns a priority level with its own concurrency share and queues. Within a level, shuffle sharding spreads flows over queues, and queued requests are dispatched fairly across flows. Critical traffic such as leader election is in an exempt or high level, and excess work is rejected with a retry hint. The hard part is classification: a misrouted request type lands in a level too small for it.",
    k: ["Per-flow fair queuing versus a flat in-flight cap: fair queuing isolates tenants, but requires careful classification and tuning.", "Rejecting excess immediately versus queuing: queuing smooths bursts, but long queues add latency, so each level bounds its queue."],
    p: ["A misconfigured flow schema routes controller traffic into a low level, making control loops slow under load.", "Clients that ignore the retry hint resend immediately and amplify the overload."],
    v: "Run a client that lists all objects in a tight loop alongside a normal controller. Confirm the controller's request latency stays within target and the noisy client receives throttled responses.",
    dep: ["api-server", "authentication", "scale-limits"]
  },
});
