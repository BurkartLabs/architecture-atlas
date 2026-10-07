// Details for the cloud control plane plate, part 4: storage provisioning, host agents and topology.
ATLAS.details("cloud-control-plane", {
  "volume-provisioning": {
    s: "Creates network-attached block volumes on request, choosing the storage cluster and recording size, type, encryption and ownership.",
    d: "A create call validates size and class limits, reserves quota, picks a storage cluster with room in the right zone and asks it to allocate the volume, optionally restoring from a snapshot. The control plane stores the record and the volume's state: creating, available, in use. Resize and class changes are further operations on the same record. It is hard because the control plane only describes the volume and the storage system actually holds it, so the two must be reconciled and failures between the two must not leak space.",
    k: ["Control plane picks the storage cluster vs the storage system decides: global balance and quota awareness; the control plane needs a current view of storage capacity.", "Thin allocation vs reserved space: more volumes per cluster and fast creation; an overcommitted cluster can run out of real space."],
    p: ["A failed create leaves space allocated in the storage cluster with no record in the control plane.", "Restoring from a large snapshot makes the volume appear available but run slowly for hours as data is loaded lazily."],
    v: "Create and delete volumes in a loop with injected failures at each step, then compare the control plane's volume list with the storage cluster's own inventory and confirm they match exactly.",
    dep: ["storage-classes", "quota-model", "workflow-engine", "resource-database"]
  },
  "volume-attachment": {
    s: "Connects a volume to a running instance and makes it appear as a disk, coordinating the control plane, the host agent and the storage system.",
    d: "An attach call checks that volume and instance share a zone and that the volume is free or multi-attach capable. The control plane tells the storage system to authorize the host, then the host agent creates the virtual device and connects it. Detach reverses this and must flush writes first. The volume's state tracks attaching, attached and detaching. The difficulty is that a stuck state is dangerous: forcing a detach while the guest is writing can corrupt data, and two hosts attached to one volume will destroy it.",
    k: ["Strict single attach with fencing vs allowing multi-attach: prevents corruption by construction; shared-disk clustered workloads need the explicit feature.", "Force detach on a dead host vs wait: lets a replacement instance start; risks losing writes still in flight from the old one."],
    p: ["A force detach lets a recovered old host write again to a volume now owned by its replacement.", "A volume stuck in detaching blocks a failover because no one is sure it is safe to move."],
    v: "Attach, write, detach and re-attach elsewhere while injecting a host failure during detach, and confirm the data matches the last acknowledged writes and the volume is never attached to two hosts.",
    dep: ["volume-provisioning", "host-agent", "instance-state-machine", "leader-election"]
  },
  "snapshot-service": {
    s: "Takes point-in-time copies of volumes into durable storage, supports incremental copies, copying between regions and restoring into new volumes.",
    d: "A snapshot request instructs the storage system to capture the volume's blocks as of a moment, usually by marking a point and copying changed blocks in the background. Later snapshots store only changes since the previous one, sharing blocks. Snapshots live in a separate durable store, are encrypted, and can be shared or copied across regions. Deleting one must keep blocks that others still need. The difficulty is crash consistency, reference counting of shared blocks, and the cost of the first full copy.",
    k: ["Incremental snapshots with shared blocks vs full copies: storage and time stay small; deletion requires reference tracking and a bug there loses data for later snapshots.", "Crash-consistent snapshots vs application-consistent: no guest cooperation needed; the database must recover from the snapshot as from a power loss."],
    p: ["A reference counting error frees a block still needed by a newer snapshot, and the restore fails months later.", "A snapshot taken while a multi-volume application writes is inconsistent across its volumes."],
    v: "Snapshot a volume under write load, restore it to a new volume, and compare every block against a checksum recorded at the snapshot point; delete the oldest snapshot and verify later ones still restore.",
    dep: ["volume-provisioning", "encryption-key-service", "storage-classes"]
  },
  "object-storage-api": {
    s: "The front end of the bucket-and-object service: authenticates requests and maps names to objects, while the data lives in a separate storage fleet.",
    d: "Customers create buckets and put, get, list and delete objects over HTTP. The front end authenticates, applies bucket and identity policies, enforces limits, and translates object keys to locations in the storage fleet through an index. It supports versions, lifecycle rules and event notification. Listing and conditional operations require a consistent index. The challenge is that this API is among the highest-volume in the cloud and its namespace is flat but must support efficient prefix listing, and that bucket names are global.",
    k: ["Global bucket namespace vs per-account names: simple URLs and sharing; names are scarce and cannot be recycled safely.", "Strongly consistent listing and overwrites vs eventually consistent: applications behave as expected; the index needs harder coordination."],
    p: ["A bucket policy that allows public read exposes data, and automated scanners find it quickly.", "Listing millions of keys under one prefix times out and tempts clients into inefficient scanning."],
    v: "Put an object, overwrite it, list and read it from several clients and confirm each sees the latest version immediately, then delete a bucket and confirm its name is not reusable until released.",
    dep: ["policy-evaluation", "request-authentication", "resource-database", "event-notifications"]
  },
  "file-share-provisioning": {
    s: "Creates shared network file systems that many instances mount at once, managing size, throughput, access points and network exposure.",
    d: "A create call allocates a file system in the storage fleet and exposes mount targets as network interfaces in the customer's subnets, each in a zone. Instances mount with a standard network file protocol. The control plane tracks capacity or throughput limits, access policies, backups and encryption. Elastic capacity grows without user steps. It is hard because the data path is stateful and shared: mount targets must be highly available per zone, and the control plane's role is only to configure them correctly.",
    k: ["Elastic size vs provisioned size: customers never run out of space; costs and noisy neighbors are less predictable.", "Mount targets in each zone vs a single endpoint: survives a zone loss and keeps traffic local; more interfaces and addresses to manage."],
    p: ["A security group on the mount target blocks the file protocol and mounts hang without a clear error.", "A throughput limit reached by one client slows every other mounted instance."],
    v: "Mount one share from instances in two zones, write from both, fail the mount target in one zone, and confirm clients in that zone reconnect through the other path within the documented time without losing acknowledged writes.",
    dep: ["virtual-interfaces", "security-groups", "storage-classes", "encryption-key-service"]
  },
  "storage-classes": {
    s: "Named tiers of storage with defined performance, durability and price, which volume and object services use to pick hardware and replication.",
    d: "A class maps to a hardware pool and a replication or coding scheme, plus performance limits such as operations per second and throughput per volume. Customers choose a class at creation and may change it later, which triggers a background migration. The control plane stores the mapping and enforces the limits through the storage system. The difficulty is making performance promises that hold under mixed load, and moving data between classes without interrupting the customer's access.",
    k: ["Performance by class vs provisioned per volume: easy to understand; provisioning lets customers buy exactly what they need but needs more capacity planning.", "Online class change vs recreate: customers keep running; migration consumes bandwidth and gets slower the busier the volume is."],
    p: ["A class change migrates terabytes in the background and drags down production performance.", "Burst allowances run out unexpectedly and a database's latency jumps with no apparent change."],
    v: "Run a benchmark against each class and confirm the delivered operations per second and throughput meet the advertised limits, then change the class under load and confirm the volume stays attached throughout.",
    dep: ["resource-model", "capacity-inventory"]
  },
  "host-agent": {
    s: "The control plane's resident presence on each machine: the single process that receives instructions, changes the host's virtual hardware and reports what it finds.",
    d: "The agent authenticates to the control plane with a host identity, opens a channel for commands and watches for desired state. It manages the hypervisor, the virtual switch, local disks and the image cache, and exposes the metadata service. It enforces local limits and refuses requests that exceed the host's capacity. It must keep running instances alive when the control plane is unreachable. The difficulty is that it has high privilege on a machine full of untrusted tenants, and every upgrade must leave running instances undisturbed.",
    k: ["Agent keeps running instances regardless of control plane vs depends on it: instances survive a control plane outage; the agent cannot rely on central checks for every action.", "One large agent vs several small ones: easy coordination; a bug or restart affects every function at once."],
    p: ["An agent crash loop on upgrade leaves a host unmanageable though its instances still run.", "A command accepted from a compromised control plane account could harm every tenant on that host."],
    v: "Stop the control plane's connectivity to a host for an hour and confirm its running instances keep running and serving traffic, and that on reconnect the agent reports state without restarting any instance.",
    dep: ["hypervisor-driver", "desired-state-reconciliation", "internal-rpc", "secrets-store"]
  },
  "desired-state-reconciliation": {
    s: "The loop in which an agent repeatedly compares what the control plane wants on its host with what is actually there, and acts to close the difference.",
    d: "The control plane records desired state per host, such as which instances, interfaces and volumes should exist. The agent pulls or is pushed that set, compares it with observed state from the hypervisor and the network layer, and makes changes: start a missing instance, remove an orphan, update a rule. Each action is idempotent and observed state is reported back. It is hard because state diverges in many ways, and the loop must decide when to repair and when to leave alone, such as an instance the customer stopped on purpose.",
    k: ["Level-triggered reconciliation vs edge-triggered commands: missed messages heal on the next pass; each loop must be cheap to run constantly.", "Auto-delete resources absent from desired state vs report only: orphans are cleaned and capacity returns; a bad desired-state feed would delete everything on the host."],
    p: ["An empty desired-state response during a control plane fault is treated as truth and the agent deletes running instances.", "Two loops on one resource fight each other, repeatedly changing it back and forth."],
    v: "Corrupt a host's state in each way, such as a missing instance, an extra interface or a wrong rule, and confirm the agent converges to the desired state within the interval without touching unrelated instances.",
    dep: ["host-agent", "resource-database", "message-bus"]
  },
  "host-registration": {
    s: "How a new machine becomes a member of the fleet: it proves its identity, reports its hardware and is admitted to the inventory.",
    d: "A newly racked host boots a provisioning image, proves its identity with a hardware-bound credential, and receives its agent and configuration. It reports processors, memory, devices, firmware versions and its rack and zone location. The control plane verifies the report against the order, admits the host in a quarantined state and releases it to placement after burn-in tests. The difficulty is trust: a machine that lies about its identity or location poisons placement and could receive another tenant's data.",
    k: ["Hardware-rooted identity vs shared bootstrap secret: a stolen secret cannot enroll a rogue machine; requires hardware support and a provisioning chain of trust.", "Quarantine and burn-in before admission vs immediate: bad hardware is caught before it touches customer data; capacity enters service later."],
    p: ["A host registered in the wrong rack breaks spread and failure-domain guarantees.", "Stale firmware on a new machine passes registration and later causes crashes across a hardware batch."],
    v: "Enroll a new host from bare metal and confirm the inventory record matches its physical location and hardware, that placement ignores it until burn-in passes, and that an unauthenticated machine is refused.",
    dep: ["host-agent", "capacity-inventory", "secrets-store"]
  },
  "heartbeats-and-health": {
    s: "Periodic messages from each host reporting that it is alive and how loaded it is, from which the control plane decides whether to trust, avoid or replace it.",
    d: "Agents send a heartbeat with resource usage and health checks for disks, network and the hypervisor. A missed heartbeat only means the control plane lost contact: the host may be dead, partitioned or merely slow. A detector uses multiple signals, such as network probes and power status, before declaring failure. Declaring a host dead triggers recovery of its instances elsewhere. The difficulty is false positives, since recovering an instance that is still running elsewhere creates two copies writing to the same volume.",
    k: ["Fast failure detection vs conservative: faster recovery for customers; false positives cause needless failovers and split-brain risk.", "Fence the host before recovery vs trust the detector: no duplicate instance can write; fencing requires power or network control that can itself fail."],
    p: ["A partition between the control plane and a healthy rack triggers mass recovery of instances that are still running.", "A host reports healthy while its storage path is broken, so instances hang with no recovery."],
    v: "Isolate a host from the control plane only, confirm it is marked unreachable but its instances are not restarted elsewhere, then power it off and confirm recovery happens once and only after fencing.",
    dep: ["host-agent", "message-bus", "capacity-inventory"]
  },
  "hypervisor-driver": {
    s: "The layer through which the agent creates, controls and inspects virtual machines on the hypervisor, hiding differences between hypervisors and hardware types.",
    d: "The driver translates the agent's commands, such as define a machine, attach a disk or interface, pause, snapshot memory and migrate, into hypervisor operations, and reads back state and counters. It also sets limits for processor shares, memory and device rates. Newer designs push much of the work to offload hardware. The difficulty is correctness at the boundary: a machine the driver thinks is stopped may still be running, and the abstraction must expose enough features, such as live migration, without leaking hypervisor quirks.",
    k: ["Abstract driver interface vs direct hypervisor calls: swapping or adding hypervisors is tractable; the least-common-denominator interface hides useful features.", "Minimal hypervisor with offload vs full-featured: small attack surface and near-native speed; needs specialized hardware and tooling."],
    p: ["A power state that the driver cannot read is assumed stopped, and a second copy of the instance is started.", "A hypervisor upgrade changes device behavior and breaks guests that depended on the old one."],
    v: "Run lifecycle operations against the driver on every supported hypervisor and hardware class and confirm the hypervisor's own state listing matches what the driver reports after each step.",
    dep: ["host-agent"]
  },
  "image-cache": {
    s: "A local store of recently used boot images on each host, so launching a machine does not have to pull the whole image over the network every time.",
    d: "When an instance starts, the agent checks its cache for the image; on a miss it fetches blocks from the image store, often lazily so the machine can boot before the full copy arrives. Local copies are checked against content hashes and shared copy-on-write among instances. A cache with a popular image saves bandwidth, but eviction and verification must be careful. The difficulty is boot latency on cold hosts and keeping the image store from being overloaded when thousands of hosts fetch a new popular image at once.",
    k: ["Lazy block fetch vs full pre-copy: instances boot sooner; early disk reads are slow and depend on the image store being up.", "Share base blocks via copy-on-write vs full copies per instance: much less disk and faster starts; a corrupted base block affects every instance using it."],
    p: ["A large fleet-wide image update causes a thundering herd that overloads the image store.", "A corrupted cached block silently feeds bad data to every new instance of that image."],
    v: "Launch the same image on a cold host and on a warm host and compare boot time, then flip one bit in the cached base and confirm the agent detects the hash mismatch and refetches instead of serving it.",
    dep: ["host-agent", "image-catalog", "snapshot-service"]
  },
  "host-lifecycle": {
    s: "The sequence of states a machine moves through from racked to serving, drained, repaired and retired, with the automation that moves it along.",
    d: "States include provisioning, burn-in, in service, draining, repair and decommission. Automation drives transitions: health failures send a host to repair, repair runs diagnostics and replaces parts, and then burn-in returns it. Firmware and agent updates use the same drain-update-return flow. Decommission wipes disks and cryptographic material before the hardware leaves. The difficulty is volume: with thousands of machines failing at a steady rate, any manual step becomes a bottleneck and any wrong automatic step can drain a whole zone.",
    k: ["Automated repair with human exceptions vs manual triage: scales to the fleet size; a faulty rule can mass-drain healthy hosts.", "Wipe at decommission only vs at every tenant change: cheap; residual data between tenants relies on the hypervisor's own clearing."],
    p: ["A health rule that is too sensitive drains many hosts at once and leaves the zone short of capacity.", "A decommissioned disk leaves the data center without a verified wipe."],
    v: "Fail a host's disk in test, confirm it drains, is repaired, passes burn-in and returns to service automatically, while the fleet-wide rate limit on concurrent drains holds.",
    dep: ["heartbeats-and-health", "maintenance-evacuation", "host-registration"]
  },
  "telemetry-agent": {
    s: "The part of the host agent that samples resource use of every instance and the host itself and ships it for metering, monitoring and diagnosis.",
    d: "It reads counters from the hypervisor and network layer for each instance, such as processor time, network bytes and disk operations, and summarizes them on intervals. Customer-visible metrics go to the monitoring service, while billing records are sent to metering with their own durability. It also exports host health and agent logs to operators. Sampling must be cheap since it runs on every host constantly. The difficulty is separating tenant data from operator data, and avoiding a telemetry flood that harms the control plane during an incident.",
    k: ["Push telemetry from hosts vs central scraping: scales with the fleet and works through address changes; the receiving end must handle bursts.", "Separate pipelines for billing and monitoring vs one shared: billing gets stronger delivery guarantees; the cost is duplicated plumbing."],
    p: ["After a partition every host resends its backlog at once and overwhelms the metrics pipeline.", "A metric label carrying a customer-supplied name leaks it into operator-wide dashboards."],
    v: "Run a known workload on an instance and compare the reported processor time, bytes and operations against independent measurements inside the guest, within the documented sampling error.",
    dep: ["host-agent", "message-bus", "usage-metering"]
  },
  "regions": {
    s: "Independent deployments of the whole cloud in separate geographic areas, each with its own control plane, data and failure behavior.",
    d: "A region is a full stack: API endpoints, services, state stores and data centers, with no runtime dependence on other regions for core operations. Customers choose where their data and resources live, which matters for latency and law. Some services are global, such as identity and billing, and are built to degrade rather than stop when a region is unreachable. The difficulty is keeping regions truly independent while still offering global features, and building new regions quickly without drifting from the others.",
    k: ["Regions fully independent vs shared control services: a regional failure stays regional; global features such as account management need a separate, carefully designed path.", "Many small regions vs few large ones: lower latency and sovereignty options; more regions to operate, with thinner capacity in each."],
    p: ["A hidden dependency on one region's service makes an outage there break every other region.", "A feature released in one region first is assumed available everywhere by customer automation."],
    v: "Cut all network connectivity between one region and the rest of the cloud, and confirm create, read, update and delete operations on that region's core services continue to work.",
    dep: ["availability-zones", "global-control-plane", "cells"]
  },
  "availability-zones": {
    s: "Separate data center locations within a region with independent power, cooling and network, connected by fast links, so one zone can fail without the others.",
    d: "A zone is one or more data centers far enough apart to avoid shared fate and close enough for low-latency replication. The control plane places state, cells and instances across zones, and tracks zone health to steer traffic away. Customers choose zones for their resources. Zone identifiers are mapped differently per account so load does not concentrate on the first zone. The difficulty is that spreading a service across zones is not enough: the quorum, the leader and every dependency must also tolerate losing a zone.",
    k: ["Synchronous replication across zones vs within a zone: survives a zone loss without data loss; every write pays inter-zone latency.", "Three zones with quorum vs two zones with a tiebreaker: standard and simple to reason about; fewer zones leave no majority after a loss."],
    p: ["A service is deployed in three zones but a hidden dependency lives in one, so a zone outage takes it down.", "Capacity in remaining zones is insufficient when customers fail over simultaneously."],
    v: "Isolate one zone in a staging region, confirm every control plane service continues to answer and instances in other zones are unaffected, and measure how much capacity the remaining zones can absorb.",
    dep: ["regions", "consensus-store"]
  },
  "cells": {
    s: "Complete, independent copies of the control plane stack each serving a bounded slice of customers, so any fault reaches only that slice.",
    d: "A cell contains the services, databases and queues needed to handle its accounts, and shares nothing with other cells at runtime. Each account is assigned to one cell; a router sends requests accordingly. Cell sizes are capped so that the worst event harms a known maximum fraction of customers. New customers fill new cells. The difficulty is everything that crosses cells: listings across accounts, global limits, organization-level features and migrating an account from one cell to another.",
    k: ["Many small cells vs fewer large cells: a small blast radius and simple capacity limits; operations, deployment and cross-cell features multiply in cost.", "Account pinned to a cell vs balanced dynamically: simple routing and strong isolation; moving a customer is a rare, heavy operation."],
    p: ["A shared dependency outside the cells fails and turns a cell-sized fault into a full outage.", "One very large customer fills a cell and cannot be split."],
    v: "Inject a fault that destroys one cell's database, and confirm only the accounts assigned to that cell see errors while all other cells continue at normal success rates.",
    dep: ["cell-router", "resource-database", "blast-radius-and-isolation"]
  },
  "cell-router": {
    s: "A thin, highly available layer that maps each request's account or resource to its cell and forwards it there, without holding any customer state itself.",
    d: "The router reads the account from the authenticated request or from the resource identifier, looks up its cell in a small mapping table and proxies the call. The table is replicated widely and cached because every request needs it. It is deliberately simple, with no business logic, since it is a dependency of every cell. Updates to the mapping are rare and carefully staged. The difficulty is keeping it tiny and static so it fails less often than anything behind it, while the mapping stays correct during account moves.",
    k: ["Mapping table cached in the router vs looked up per request: no extra dependency on the hot path; stale entries after a move cause misrouting until expiry.", "Router decides from the identifier alone vs consults a table: no lookup at all and nothing to fail; accounts cannot be moved without changing their identifiers."],
    p: ["A router bug or bad mapping update misdirects every customer, a failure no cell isolation can contain.", "A moved account is served by two cells for a short time and writes land in both."],
    v: "Update the mapping for a test account while sending continuous traffic and confirm each request reaches exactly one cell, and that taking the mapping store offline leaves the router serving from its cache.",
    dep: ["cells", "service-discovery"]
  },
  "global-control-plane": {
    s: "The small set of services that must span regions, such as account identity, organization structure and billing, built to depend on as little as possible.",
    d: "Some data is inherently global: which accounts exist, their payment status, their hierarchy and top-level identity. These services are kept off the request path of regional work wherever possible. Regions hold cached or replicated copies and keep working if the global service is unreachable. Writes, such as creating an account, are rare and tolerated slower. The difficulty is that every global dependency is a way a failure in one place spreads to all regions, so the list must stay short and each item must degrade gracefully.",
    k: ["Replicate global data into regions vs call it on demand: regions keep serving when the center is down; copies can be stale for a while.", "Single writer home region vs multi-region writes: simple and consistent; the home region's loss blocks changes until failover."],
    p: ["A new feature adds a synchronous call to a global service from the request path and quietly makes every region depend on it.", "Replication lag lets a just-closed account act in another region for minutes."],
    v: "Block all access to the global services from one region and confirm requests there continue to be authenticated and authorized from local copies, with only changes to global data refused.",
    dep: ["regions", "resource-database", "consensus-store"]
  },
  "region-build-out": {
    s: "The automated process of bringing up a new region or zone from empty hardware to serving customers, using only the software and configuration the existing regions use.",
    d: "Build-out starts from racks of machines and runs a dependency-ordered sequence: bootstrap the lowest services, then state stores, then messaging, then the services above, validating each layer. Configuration is generated from a declarative description of the region. It ends with test traffic and a final readiness review. Done well, it is the same code path as a rebuild after a disaster. The difficulty is the dependency order, since the services that deploy others need to exist first, and avoiding hand-built steps that cannot be repeated.",
    k: ["Fully declarative region definition vs scripted runbooks: reproducible and reviewable; the definition must model every special case.", "Build every region the same way vs a tailored first region: operations stay uniform; the first region must be built with the tools it will later be used to build."],
    p: ["A manual step in the first region is never captured, and the second region differs in a way that surfaces months later.", "Build-out finishes before capacity and quotas are set, so customers launching on day one hit limits."],
    v: "Build a fresh region from scratch in an isolated environment with no manual intervention, run the full API conformance suite against it and confirm every service passes and matches the reference region's configuration.",
    dep: ["dependency-bootstrap", "deployment-pipeline", "regions"]
  },
  "static-stability": {
    s: "The property that the data plane keeps working at its last known good state when the control plane is down, rather than needing it to continue.",
    d: "Running instances, network paths and mounted volumes must not need a control plane call to continue. Hosts keep their configuration and forward packets from local state; services pre-provision capacity so recovery does not require creating new resources. Control plane actions, such as launching, may fail, but already-running workloads do not. The design discipline is to move work out of the request path and into reconciliation. The difficulty is finding hidden dependencies, like a credential refresh or a lease renewal, that look like data plane steps but call the control plane.",
    k: ["Over-provision to avoid scaling at failure time vs scale on demand: recovery needs no control plane; spare capacity costs money all the time.", "Data plane caches last-known configuration vs fetches fresh: survives outages; may act on stale configuration after the outage ends."],
    p: ["A data plane component renews a lease through the control plane, and an hour-long outage causes it to stop serving.", "Cached configuration is applied after a bad change was rolled back, reintroducing the fault."],
    v: "Shut down the whole control plane in a test region for several hours with workloads running, and confirm traffic, disk access and in-place instance operation continue with zero errors attributable to the outage.",
    dep: ["host-agent", "desired-state-reconciliation", "overlay-dataplane"]
  },
});
