// Details for the block storage plate, part 1: volume API, observability, host attach.
ATLAS.details("block-storage", {
  "volume-resource-model": {
    s: "The definition of a volume as a resource: identity, size, type, zone, state, encryption setting, attachments and parent snapshot, plus which fields can change after creation.",
    d: "A volume record holds a stable identifier, a size in fixed units, a performance type, a placement zone, an owner, a lifecycle state and references to attachments and to the snapshot it was created from. Some fields are immutable, such as zone and encryption key, and others are modifiable with side effects, such as size and performance targets. The record is the contract between the API, the metadata service and billing. It is hard because every later feature, such as multi-attach or clones, adds fields that older components must tolerate.",
    k: ["Immutable zone and key versus movable volumes: simple placement and key handling, but moving a volume becomes a copy operation the customer must request.", "One resource with a type field versus separate resource kinds per tier: a single API surface is easier to learn, but type-specific rules leak into shared code."],
    p: ["Adding a field without a default breaks older clients and workflows that read the record.", "Treating size as only a number hides alignment rules, so a valid request fails at the chunk layer."],
    v: "Create a volume, read it back, and confirm every field matches the request. Attempt to change an immutable field and confirm a precise error, while a modifiable field changes and the record version increments.",
    dep: ["volume-metadata-service"]
  },
  "volume-api": {
    s: "The public interface to create, describe, modify, attach, snapshot and delete volumes, with authentication, idempotency tokens and asynchronous results.",
    d: "Requests arrive over HTTP, are authenticated and authorized, validated against quotas and the type catalog, and turned into a record plus a workflow. Most calls return immediately with a pending state and the caller polls or subscribes for the result. Idempotency tokens let clients retry safely. The API also lists and filters resources and paginates. The difficulty is correctness under retries and concurrency: two overlapping modifications, or a delete racing an attach, must resolve to one coherent outcome.",
    k: ["Asynchronous calls returning a pending state versus synchronous completion: the API stays responsive during long workflows, but clients must handle intermediate states and failures that surface later.", "Client-supplied idempotency tokens versus server-side deduplication by content: tokens are precise, but clients that omit them can create duplicates on retry."],
    p: ["A retried create without a token produces two billed volumes after a timeout.", "Listing calls that read stale replicas show a volume as missing right after creation."],
    v: "Send the same create request with one token three times and confirm exactly one volume exists, and every response returns the same identifier. Then send a delete during an attach and confirm one defined outcome.",
    dep: ["volume-resource-model", "volume-state-machine", "quotas-and-limits"]
  },
  "volume-state-machine": {
    s: "The set of lifecycle states a volume may be in and the legal transitions between them, enforced in one place so concurrent workflows cannot corrupt it.",
    d: "States such as creating, available, attaching, in-use, detaching, resizing, snapshotting, deleting and error are held in the metadata record. A transition is a compare-and-set on the current state and version, so only one workflow owns a transition at a time. Workflows are resumable: each step records progress so a crashed controller can pick up where it stopped. Error states carry a reason and a repair path. The hard part is the number of combinations, such as snapshotting while resizing, which must each be allowed or refused on purpose.",
    k: ["A single guarded state field versus independent flags per operation: one field makes illegal combinations impossible, but forces serialization of operations that could safely overlap.", "Resumable step-by-step workflows versus all-or-nothing transactions: they survive controller crashes, but every step needs an idempotent rollback or forward path."],
    p: ["A workflow that crashes between steps leaves a volume stuck in a transitional state with no owner.", "Allowing deletion while a snapshot copy runs orphans chunks that nothing references."],
    v: "Kill the controller process in the middle of an attach and confirm another instance resumes the workflow and the volume ends in-use, or returns to available with a recorded reason.",
    dep: ["volume-metadata-service", "volume-resource-model"]
  },
  "resize-workflow": {
    s: "Grows a volume while it stays attached by extending its chunk map, then telling the host so the guest can use the new space.",
    d: "The workflow validates the new size against limits, allocates additional chunks, commits a new chunk map version, and notifies the attachment so the client driver updates the advertised capacity. The guest then grows its partition and file system itself. Shrinking is usually refused because the service cannot know which blocks the guest uses. Performance limits that scale with size are recalculated at commit. The difficulty is ordering: capacity must not be advertised to a host before the chunk map is durable, and a failure mid-way must not leave size and limits disagreeing.",
    k: ["Grow-only resizing versus supporting shrink: growth is a metadata change, while shrink requires guest cooperation and risks data loss.", "Immediate capacity change versus a wait for a cool-down: immediate growth suits emergencies, but limits on frequency protect the allocator from churn."],
    p: ["Advertising new capacity before the chunk map commits makes the guest write to unallocated space.", "Size-scaled performance limits not updated at commit leave a larger volume throttled as before."],
    v: "Grow an attached, busy volume from 100 to 200 GiB, confirm the guest sees the new size without detaching, write to the last block and read it back, and confirm the limits match the new size.",
    dep: ["chunk-allocator", "volume-state-machine", "host-agent"]
  },
  "volume-type-catalog": {
    s: "The list of offered volume types, each defining media pool, redundancy scheme, performance limits and how those scale with size.",
    d: "A type maps to a media pool, a replication or erasure-coding scheme, a baseline and maximum IOPS and throughput, a burst policy and a price. The catalog is data, consulted by the API when a volume is created or modified, and by the frontend when it sets limits. Changing a type of an existing volume triggers a background migration. The hard part is keeping the promise meaningful: a type that advertises a number must actually be placeable at that number across the fleet.",
    k: ["Types fixed by name versus free-form performance parameters: named types simplify capacity planning, while free-form parameters give customers control but make placement a packing problem.", "Online type change by migration versus recreate-and-copy: online change is convenient but consumes migration bandwidth and has a transition period."],
    p: ["Promising limits the underlying pool cannot sustain at peak makes every volume of that type underperform.", "Editing a type in place silently changes limits for existing volumes."],
    v: "Create volumes of two types, drive each at its advertised maximum, and confirm measured IOPS and throughput match the catalog entry to within the stated tolerance.",
    dep: ["media-pools", "iops-rate-limiter"]
  },
  "quotas-and-limits": {
    s: "Per-account and per-region caps on volume count, total capacity, provisioned IOPS and snapshot count, checked when resources are created or grown.",
    d: "Counters track what each account has provisioned, and each create, grow or snapshot checks them before committing. Limits have defaults, can be raised on request, and may be tiered by account age or type. The check and the increment must be atomic with the resource change, or two concurrent requests can both pass. Counters are reconciled periodically against the actual resource list to repair drift. Limits also protect the fleet: a runaway automation that creates thousands of volumes is stopped here rather than at capacity.",
    k: ["Strict transactional counters versus eventually consistent checks: strict counters never overshoot but add contention on hot accounts, while loose checks scale and allow small overshoots.", "Limits by provisioned amounts versus by actual use: provisioned limits are predictable, but reserve capacity that may never be written."],
    p: ["Counters that are not reconciled drift upward after failed workflows and block customers with free quota.", "Two simultaneous creates both pass a check made before either increments."],
    v: "Set a limit of ten volumes, issue twenty concurrent creates, and confirm exactly ten succeed, ten return a quota error, and the counter equals the number of existing volumes.",
    dep: ["volume-metadata-service"]
  },
  "volume-scheduler": {
    s: "Chooses where a new volume's chunks will live at creation, balancing capacity, failure domains, load and the requested type.",
    d: "On creation it asks the placement engine for a set of replica groups in the requested zone, using current capacity, load and domain information, and reserves space so concurrent requests do not overbook. It may spread a volume's chunks across many groups for parallelism or keep them together for locality. For clones it prefers nodes that already hold the source. The hard part is that the choice is long-lived: a poor choice made at creation persists until the rebalancer corrects it.",
    k: ["Spreading each volume across many nodes versus concentrating it: spreading gives parallel speed and shares failures widely, concentrating limits the number of volumes any single failure touches.", "Reservation at creation versus lazy allocation on first write: reservation prevents later out-of-space failures, but strands capacity in thin volumes."],
    p: ["Placing a burst of new volumes on the emptiest nodes overloads those nodes within minutes.", "Reservations not released after failed creates slowly shrink usable capacity."],
    v: "Create one thousand volumes in a test zone and confirm replicas of each are in distinct failure domains and per-node chunk counts stay within a stated spread of the mean.",
    dep: ["placement-engine", "capacity-tracker"]
  },
  "volume-metrics": {
    s: "Per-volume counters and gauges for operations, bytes, queue depth and latency, published to customers and used internally to enforce and verify performance.",
    d: "The frontend and the client driver count reads, writes, bytes, queue length and time spent throttled for every volume, aggregate over short windows and publish them to a metrics pipeline. Customers see them in their monitoring; operators use the same data to find hot volumes. Cardinality is the difficulty: millions of volumes times dozens of series is a heavy load, so aggregation happens near the source and some series are sampled. Metrics must distinguish time waiting in a limiter from time spent in storage.",
    k: ["Per-volume series versus per-node aggregates: per-volume data answers customer questions, but its volume grows with the fleet and needs retention limits.", "Metrics emitted by the client driver versus by the service: client-side numbers include the network and host, while service-side numbers are trusted and uniform."],
    p: ["Reporting only averages hides stalls that last seconds.", "Metrics that count throttled time as service latency lead customers to blame the storage for their own limits."],
    v: "Run a fixed workload of one thousand writes of 4 KiB and confirm the published operation and byte counts match exactly, and throttled time is reported separately from latency.",
    dep: ["volume-frontend", "latency-histograms"]
  },
  "latency-histograms": {
    s: "Distributions of request latency per volume, node and stage, recorded in fixed buckets so percentiles can be computed and merged across the fleet.",
    d: "Each stage of the path, such as client queue, frontend, network, node queue and drive, records durations into logarithmic buckets. Histograms merge by adding counts, so fleet-wide percentiles are exact to the bucket width, unlike averaging percentiles. The tail matters most because a single slow chunk stalls a whole request. The hard part is attributing time: a slow request needs a breakdown by stage to point at a cause, which means consistent timestamps at every hop.",
    k: ["Fixed logarithmic buckets versus sketches with adaptive buckets: fixed buckets are cheap and mergeable, but resolution is coarse where it matters most.", "Per-stage recording versus end-to-end only: per-stage data locates the slow component, at the cost of more series and clock-consistency work."],
    p: ["Averaging per-node percentiles gives a number that matches no real request.", "Coarse top buckets bury a rise from 10 ms to 40 ms inside one bar."],
    v: "Inject a fixed 20 ms delay at the node stage and confirm that stage's histogram shifts by 20 ms while client and network stages stay unchanged.",
    dep: ["volume-frontend", "node-io-scheduler"]
  },
  "slow-io-tracing": {
    s: "Samples individual requests and records a timestamped trace through client, frontend, network and node stages, so a specific slow request can be explained.",
    d: "A small fraction of requests, plus every request over a latency threshold, carries a trace identifier through each hop. Each stage records arrival, start and finish times and which replica served it. Traces are stored briefly and queried by volume and time range. They answer questions histograms cannot, such as whether the slow replica was always the same node. Cost is controlled by sampling and by keeping only slow outliers in full. The difficulty is overhead on the hot path and aligning clocks across machines.",
    k: ["Head sampling versus tail sampling on latency: head sampling is cheap and unbiased but rarely catches rare stalls, while tail sampling keeps the slow ones at the cost of buffering every trace until it completes.", "Always tracing slow requests versus on-demand tracing: always-on finds surprises, on-demand limits overhead but needs the problem to be reproducible."],
    p: ["Trace identifiers dropped at a retry or hedged request make the slow path invisible.", "Unsynchronized clocks make a stage appear to finish before it starts."],
    v: "Make one node answer slowly for one volume, then query traces for that volume and confirm the slowest requests all show that node's stage as the longest span.",
    dep: ["volume-frontend", "request-router", "node-io-scheduler"]
  },
  "noisy-neighbor-detection": {
    s: "Finds volumes whose load degrades others on the same nodes or network paths, and either throttles them or moves them.",
    d: "It correlates per-volume demand with latency on shared nodes, drives and links. A volume that uses far more than its share of a drive's queue while others on that drive see rising latency is flagged. Responses include tightening its limits, moving its chunks to quieter nodes or alerting the owner. The hard part is causation: correlation alone can blame the wrong volume, and legitimate bursts within purchased limits should not be punished, so detection often informs placement rather than enforcement.",
    k: ["Enforcing strict per-volume limits versus detecting and reacting: strict limits are predictable and cheap to reason about, while reactive detection allows higher utilization but permits temporary harm.", "Moving the noisy volume versus moving its victims: moving the source solves the cause, but moving victims is fairer to a customer who stayed within their limits."],
    p: ["Flagging by raw throughput penalizes large volumes that are simply busy within limits.", "Moving chunks during a congestion event adds the load it was meant to reduce."],
    v: "Run a heavy writer and several light volumes on one node, confirm the detector names the heavy writer within its stated window, and light-volume latency recovers after the response.",
    dep: ["volume-metrics", "latency-histograms", "migration-coordinator"]
  },
  "fleet-upgrade": {
    s: "Updates frontend, node and metadata software in small batches while volumes stay attached, watching health signals and rolling back automatically.",
    d: "Upgrades proceed by domain, a few nodes or frontends at a time. A node is drained of leadership, its in-flight requests are completed or redirected, it is updated and restarted, and it must rejoin and catch up before the next batch begins. Versions run side by side, so wire formats and on-disk formats must be compatible both ways during the rollout. Health gates stop the rollout on latency or error regressions. The difficulty is that an upgrade is a planned failure of many machines, and it must never coincide with an unplanned one in the same replica set.",
    k: ["Rolling in-place upgrade versus building a new fleet and shifting load: in-place needs no spare capacity but exposes mixed-version risk, while parallel fleets cost hardware.", "Format changes made in two releases (tolerate then use) versus one: two releases are safer and allow rollback, at the cost of a long migration window."],
    p: ["Restarting two nodes of the same replica group in one batch removes the write quorum.", "A new on-disk format written before rollback is ruled out makes rollback destroy data."],
    v: "Roll a new build across a test cell under a steady write load and confirm no volume sees an error, tail latency stays within a stated bound, and every replica group had a quorum throughout.",
    dep: ["epoch-manager", "node-health-monitor", "correlated-failure-guard"]
  },
  "attach-workflow": {
    s: "The sequence that connects a volume to a host: check ownership and zone, record the attachment, grant access, and have the host agent present the device.",
    d: "The API validates that the volume is available, the host is in the same zone and the caller may use both. The workflow writes an attachment record, issues the host a credential or access grant, and tells the host agent to connect the client driver. The host reports success only when the device is readable. The volume then moves to in-use. Each step is resumable. The hard part is partial failure: a host that connected but never reported must not leave the volume appearing free to another host.",
    k: ["Recording the attachment before the host connects versus after: before is safe against double use, but needs cleanup if the host never connects.", "Host reports completion versus the service probing the connection: host reports are cheap, but a probe from the service is the only proof the path works."],
    p: ["A host that disappears mid-attach leaves a record that blocks attaching elsewhere until a timeout.", "Skipping the zone check lets a cross-zone attach succeed with high latency."],
    v: "Attach a volume to a running guest, confirm the guest lists a new block device with the right size, write a block and read it back, and confirm the attachment record names exactly that host.",
    dep: ["attachment-registry", "host-agent", "volume-state-machine", "access-policy"]
  },
  "attachment-registry": {
    s: "The authoritative record of which hosts are attached to which volumes, in what mode and since when, consulted before any write is accepted.",
    d: "Each attachment has a volume, a host, a mode such as read-write or read-only, and an epoch that increases whenever the holder changes. The frontend checks the epoch on every write, so a stale host is rejected even if it still believes it is attached. The registry is part of the metadata service and is updated in the same transaction as the state machine. The hard part is being the single source of truth: if it disagrees with what a host believes, the registry wins, and the host must be forced to notice.",
    k: ["Epoch checks on every write versus on connection setup only: per-write checks stop stale writers immediately, at the cost of metadata on the hot path.", "One writer by default with explicit multi-attach versus open sharing: the default prevents file system corruption from two uncoordinated hosts."],
    p: ["Caching the registry on the frontend for too long lets a fenced host keep writing.", "Recording attachments by host name instead of a unique identity breaks when a host is rebuilt with the same name."],
    v: "Attach a volume to host A, move it to host B, then attempt a write from A and confirm the write is rejected with an epoch error and the data written by B is intact.",
    dep: ["volume-metadata-service", "epoch-manager"]
  },
  "host-agent": {
    s: "A privileged service on each compute host that carries out attach, detach and resize commands and keeps the client driver connected.",
    d: "The agent receives commands from the control plane, creates or removes block devices, configures the client driver with endpoints and credentials, and reports state back. It monitors connections, reconnects after network blips and renews short-lived credentials. During host maintenance it is the component that quiesces devices. The hard part is its blast radius: it runs with high privilege next to untrusted guests, and a bug can stall every volume on the host, so it is kept small and its state is recoverable from the registry.",
    k: ["Agent pushed commands versus agent polling the registry for desired state: push is fast, but polling converges after missed messages and lost agents.", "Agent in the host kernel path versus a separate process: kernel placement is fast, a separate process is easier to restart without disturbing running I/O."],
    p: ["An agent restart that drops its state detaches volumes that guests are using.", "Expired credentials not renewed during a control-plane outage cause every attached volume to fail at once."],
    v: "Kill and restart the agent while a guest writes continuously, and confirm no I/O errors reach the guest and the device list equals the registry afterward.",
    dep: ["block-device-driver", "attachment-registry"]
  },
  "block-device-driver": {
    s: "The host or guest driver that exposes a remote volume as a local block device and turns each block request into a message to the service.",
    d: "It registers a device with the operating system, accepts read, write, flush and discard requests from the I/O stack, and maps them to the wire protocol. It manages queues, splits requests that exceed protocol size, tracks completions and retries. A flush must not complete until earlier writes are durable on the service. The driver also enforces timeouts so a hung service surfaces as errors rather than frozen processes. The difficulty is behaving well under failure: too-aggressive retries amplify an outage and too-patient ones hang the guest.",
    k: ["Retry forever versus fail after a timeout: retrying keeps applications unaware of short outages, but a long outage freezes processes that cannot be killed.", "Queue depth set by the driver versus by the guest: a driver cap protects the service, while a guest-controlled depth lets applications reach full speed."],
    p: ["Treating a flush as complete when the write is merely queued violates the durability file systems rely on.", "A fixed timeout shorter than a failover makes every failover look like data errors."],
    v: "Write a block, issue a flush, cut power to the host, then read from another host after fencing, and confirm every flushed write is present.",
    dep: ["initiator-protocol", "multipath-client", "host-agent"]
  },
  "initiator-protocol": {
    s: "The wire protocol between client and service: framing, request identifiers, offsets, lengths, flush and discard operations, and error codes.",
    d: "Requests carry a volume handle, operation, offset, length and a client-chosen identifier, and responses carry the same identifier with a status. Multiple requests are outstanding at once and may complete out of order. Authentication and the attachment epoch are carried at connection setup and on each write. Standard block-over-network protocols or a custom protocol are both used. The hard parts are idempotence, since a retried write after a timeout may duplicate an acknowledged one, and versioning so old clients keep working.",
    k: ["Standard protocol versus custom protocol: standard protocols give broad client support, but a custom protocol can carry epochs, hints and tracing fields.", "Out-of-order completion versus ordered responses: out-of-order is faster, but the client must track dependencies where the guest requires ordering."],
    p: ["A retried write that races with a later write to the same offset can restore old data.", "Length fields unchecked on the server allow a malformed request to read past the volume."],
    v: "Capture a session, replay a write request with the same identifier twice, and confirm the second is recognized as a duplicate and the final block content equals the last distinct write.",
    dep: ["transport-stack", "volume-frontend"]
  },
  "multipath-client": {
    s: "Maintains several connections to different frontends and fails over or spreads requests among them, so the loss of one path does not interrupt the guest.",
    d: "The client opens connections to more than one frontend, possibly over different network paths. Requests are spread by load or sent to one active path with the others on standby. On a path failure, outstanding requests are reissued on another path, which means the service must handle a request that may already have been executed. Path health is probed continuously. The hard part is the interaction with timeouts and epochs: failing over too fast on a slow path causes duplicates, and too slow causes stalls.",
    k: ["Active-active paths versus active-standby: active-active uses all bandwidth, but ordering between paths needs care, while active-standby is simpler to reason about.", "Failover on timeout versus on explicit path-down signal: signals are quick but not always available, so timeouts remain as the backstop."],
    p: ["Reissuing a write on a second path while the first still executes can reorder two writes to one block.", "Both paths traversing the same switch means a single failure removes the redundancy."],
    v: "Pull one network path during a sustained write stream and confirm no request fails, the guest sees only a latency bump below a stated bound, and a read-back of all written blocks matches.",
    dep: ["initiator-protocol", "request-router", "storage-network"]
  },
  "multi-attach-fencing": {
    s: "Allows several hosts to use one volume at once for clustered workloads, and revokes a failed or partitioned host's ability to write.",
    d: "Multi-attach marks a volume shareable and lists the permitted hosts. The service does not coordinate the guests, so the guests' cluster software must. What the service adds is fencing: persistent reservations or epoch revocation that make the service reject writes from a host the cluster has decided to remove. Reservations are stored in the metadata and checked by the frontend on every write. The hard part is that fencing must take effect everywhere, including queued requests in the frontend and the network, before the cluster takes over the data.",
    k: ["Service-enforced fencing versus trusting guest cooperation: enforcement is the only way to stop a hung host that later wakes and writes, but it adds state checked on the write path.", "Limiting multi-attach to specific types versus all types: limits keep the consistency model simple but exclude some workloads."],
    p: ["Fencing that applies only to new connections leaves writes already queued on the old path.", "Two hosts both writing a non-cluster file system corrupts it silently."],
    v: "Attach two hosts, fence one, and immediately write from it with requests already in flight. Confirm every post-fence write is rejected and the surviving host's reads see a consistent state.",
    dep: ["attachment-registry", "epoch-manager", "volume-frontend"]
  },
  "detach-workflow": {
    s: "Cleanly disconnects a volume after flushing, and provides a forced path that revokes access when a host is unreachable.",
    d: "A normal detach asks the guest to release the device, drains outstanding I/O, flushes, removes the device and clears the attachment. A forced detach is used when the host is gone or hung: the service advances the epoch so the host can no longer write, marks the attachment cleared and makes the volume available. Data written before the force is durable. The hard part is knowing the host is really dead: forced detach on a merely partitioned host is safe only because of epoch fencing, so the force path must go through the same fence as writes.",
    k: ["Wait for host confirmation versus force after a timeout: waiting is safest for the data in flight, while forcing restores availability when the host never answers.", "Allowing force immediately versus requiring a grace period: a grace period gives a slow host time to flush, but delays recovery."],
    p: ["Forcing a detach without bumping the epoch lets a returning host overwrite the new owner's data.", "A stuck detach leaves the volume unusable, and customers cannot recover without support."],
    v: "Freeze a host mid-write, force detach and attach the volume to another host, then unfreeze the first and confirm its writes are rejected and the second host's data is unchanged.",
    dep: ["attachment-registry", "epoch-manager", "volume-state-machine"]
  },
  "offload-card": {
    s: "A dedicated hardware device on the host that presents the block device to the guest and runs the client protocol, keeping it off the host CPU.",
    d: "The card exposes a standard storage interface to the guest over the bus and implements the client driver, encryption and rate limits in its own processors and firmware. The host processor sees only the guest's requests being handed over. This reduces host overhead, isolates storage traffic from the host operating system and gives consistent latency. The card has its own control channel for attach and detach. The difficulty is that firmware becomes a critical component: updates must be rolled out and rolled back safely, and debugging has limited visibility.",
    k: ["Offload hardware versus a software driver on the host: offload frees host cores and isolates tenants, but ties performance and features to firmware release cycles.", "Encryption on the card versus in the service: on-card keeps plaintext off the network path, but gives the card key-management duties."],
    p: ["A firmware bug affects every volume on every host that has the card, with limited ways to patch live.", "Card queues smaller than guest demand cap throughput well below what the service could deliver."],
    v: "Run a guest benchmark with the offload card and with the software driver on the same host and compare host CPU use and tail latency at equal throughput. Confirm the card figure is lower.",
    dep: ["initiator-protocol", "transport-stack"]
  },
  "live-migration-handoff": {
    s: "Moves a running guest to another host while its volume stays in use, transferring the attachment without losing or duplicating writes.",
    d: "During guest migration the volume must be reachable from both source and destination for a short time. The destination connects in a standby mode, the source finishes its outstanding writes, the guest pauses, and the attachment epoch advances to the destination. The destination then resumes the guest. Reads from the destination are allowed only after the handoff. The hard part is the pause window: it must be short, and any write accepted from the source after the epoch change must be refused, since the source could still emit queued requests.",
    k: ["Short dual-attach window versus detach-then-attach: dual attach keeps the pause short, but needs the multi-host fencing machinery.", "Draining the source before the epoch change versus after: draining first avoids rejections, at the cost of a longer guest pause."],
    p: ["A write queued in the source's network buffers arrives after the handoff and is rejected, surfacing an I/O error in the guest.", "Migration of a volume with cached dirty data on the host loses writes if flush is skipped."],
    v: "Migrate a guest running a checksummed write loop across hosts, then verify no write is missing or duplicated, the pause stays under its stated limit, and the old host's later writes are rejected.",
    dep: ["multi-attach-fencing", "attachment-registry", "epoch-manager", "block-device-driver"]
  },
  "protocol-target": {
    s: "The service endpoint that terminates client connections, authenticates them and decodes requests into internal operations.",
    d: "It accepts connections from clients, performs authentication and the attachment epoch check, decodes requests and hands them to the volume frontend. It also encodes responses and enforces size and rate sanity limits so one broken client cannot exhaust resources. Because it is the first stage after the network, it carries the connection count, so it is built for many mostly idle connections with a few that are busy. The hard part is protecting itself: slow, malformed or abusive clients must cost the service little.",
    k: ["Stateless target in front of stateful frontends versus a combined process: separate processes scale connections independently, but add a network hop to every request.", "Per-connection buffers sized for peak versus pooled shared buffers: dedicated buffers are simple, pooled buffers support far more connections but need backpressure."],
    p: ["Accepting unbounded outstanding requests per connection lets a single client exhaust memory.", "Authentication on connect only means credential revocation takes effect at the next reconnect, not immediately."],
    v: "Open ten thousand idle connections plus a malformed-frame flood and confirm memory stays within its limit, legitimate request latency is unchanged and the offending connections are closed with an error.",
    dep: ["initiator-protocol", "access-policy", "transport-stack"]
  },
  "volume-frontend": {
    s: "Holds the per-volume serving state for a volume: its current chunk map, limits and attachment epoch, and drives each request through to storage nodes.",
    d: "Each volume is served by one or a few frontend instances. The frontend splits a request on chunk boundaries, applies rate limits, checks the epoch, looks up replicas in the map, and sends reads and writes to nodes. It collects the replies and answers the client. Because it keeps volume state it is the usual place for tail-latency logic and for coalescing. The hard part is failover: moving a volume to another frontend must not leave two instances both believing they own it.",
    k: ["Volume pinned to one frontend versus any frontend serving any volume: pinning keeps state local and ordering simple, but makes frontend failure a per-volume event.", "Frontend as the coordinator of replication versus clients writing to replicas directly: a coordinator simplifies clients, but adds a hop."],
    p: ["Two frontends serving one volume after a partition accept conflicting writes unless an epoch is enforced.", "A frontend crash with no persisted in-flight state loses track of which writes were acknowledged."],
    v: "Kill the serving frontend during writes and confirm another takes over within its stated time, every acknowledged write remains readable, and no write was applied by two owners.",
    dep: ["volume-map-cache", "request-router", "iops-rate-limiter", "epoch-manager"]
  },
  "volume-map-cache": {
    s: "A local copy of each volume's chunk map and replica locations, versioned so stale entries are detected and refreshed.",
    d: "The map translates a volume offset into a chunk and the nodes that hold it. The frontend caches it so most requests need no metadata call, and tags each entry with a version. When a node rejects a request because the chunk moved or its epoch changed, the cache refreshes. Updates are pushed or pulled after rebalancing. The hard part is staleness: serving from an old map must fail loudly rather than reach a node that no longer owns the chunk, which depends on nodes validating the version.",
    k: ["Cache with version validation at the node versus strongly consistent lookups: validation keeps the hot path local, while per-request lookups would overload metadata.", "Pushing updates versus lazy refresh on error: push narrows staleness, but lazy refresh is simpler and self-healing."],
    p: ["A node that accepts requests for a chunk it no longer owns turns a stale map into silent data loss.", "Cache refreshes arriving in a thundering herd after a mass movement overload the metadata service."],
    v: "Move a chunk to another node, issue a request using the old map, and confirm the old node rejects it, the cache refreshes once and the retry succeeds with no data difference.",
    dep: ["chunk-map", "volume-metadata-service"]
  },
  "request-router": {
    s: "Splits each client request along chunk boundaries, sends the pieces to the right nodes in parallel and reassembles the result.",
    d: "A large or misaligned request may span several chunks on different replica groups. The router creates one sub-request per chunk, tracks them under one parent and completes the parent when all finish or when one fails. Writes go to the replica protocol and reads to a chosen replica. It enforces ordering rules where the guest requires them, such as a flush after earlier writes. The hard part is partial failure: when one sub-request fails, the parent reports an error even though other pieces already applied.",
    k: ["Splitting at the frontend versus at the client: frontend splitting keeps clients simple, while client splitting saves a hop for large requests.", "Fan-out all at once versus bounded concurrency: all at once is fastest for a single request, but bounded fan-out protects nodes from large bursts."],
    p: ["A multi-chunk write that fails halfway leaves a torn region that the guest is told failed but is partly written.", "Unbounded fan-out from large requests saturates a few nodes while others idle."],
    v: "Issue a write spanning three chunks while one replica group is down, and confirm the parent returns an error or success consistently, and every chunk's content is either entirely old or entirely new per its own guarantee.",
    dep: ["volume-map-cache", "primary-backup-protocol", "write-quorum"]
  },
  "io-queue-manager": {
    s: "Holds admitted requests in per-volume queues and decides dispatch order, so one volume's backlog does not delay another.",
    d: "After limits admit a request, it waits in a queue per volume, and the manager picks across queues by weighted fairness, using the volume's type and recent behavior. It enforces queue depth caps and applies backpressure to the client when full. It also separates reads from writes and foreground from recovery traffic. The hard part is fairness with unequal request sizes and bursty arrivals: a policy that treats every request equally lets a stream of large requests starve small ones.",
    k: ["Per-volume queues with weighted fair dispatch versus a shared FIFO: per-volume isolation is predictable, while a shared queue is simpler and uses capacity better under uniform load.", "Cost-based accounting (bytes and operations) versus operation counts alone: cost-based is fairer for mixed sizes, but needs a tuned cost model."],
    p: ["A single deep queue grows memory and latency without bound when the backend is slow.", "Priority that favors small requests starves large sequential transfers indefinitely."],
    v: "Run one volume at saturation next to a low-rate latency-sensitive volume and confirm the second volume's tail latency stays within a stated multiple of its idle latency.",
    dep: ["iops-rate-limiter", "volume-frontend"]
  },
  "iops-rate-limiter": {
    s: "Enforces each volume's purchased operations per second and throughput ceiling, delaying or rejecting requests that exceed it.",
    d: "A token bucket per volume refills at the provisioned rate. Each request consumes tokens by operation count and bytes, whichever is more restrictive. When tokens are exhausted the request waits or is held at the client. Limits scale with volume size or are provisioned explicitly. Limiting happens at the frontend, and sometimes also at the host driver so throttling never reaches the network. The hard part is defining one request's cost: a 1 MiB request is not one operation, and a limit that ignores size is easy to game.",
    k: ["Delay requests versus reject with an error: delaying looks like slower storage and keeps applications working, while rejecting surfaces limits but breaks software not built for it.", "Enforcing at the client versus at the service: client enforcement saves network, but only the service can be trusted to enforce."],
    p: ["Splitting large requests into many small ones lets a client exceed its byte limit if cost counts only operations.", "Limits enforced separately at two frontends of a multi-path client allow double the purchased rate."],
    v: "Provision 1,000 IOPS, drive 5,000 IOPS of 4 KiB reads for a minute, and confirm the measured steady rate stays at 1,000 within a few percent with queue time, not errors, absorbing the excess.",
    dep: ["burst-bucket", "volume-type-catalog"]
  },
  "burst-bucket": {
    s: "Lets a volume exceed its baseline performance for a limited time by spending credits accumulated while it was idle.",
    d: "Credits accrue at the baseline rate or below when the volume is underused, up to a cap, and are spent when demand exceeds baseline, up to a maximum burst rate. When credits run out the volume falls to baseline. Bursting helps boot storms and spiky workloads without provisioning for peak. The service must be able to honor the sum of possible bursts. The hard part is surprise: workloads that rely on burst, then hit baseline after hours, see a sudden slowdown and need clear signals that credits are spent.",
    k: ["Credit-based bursting versus fixed high provisioning: credits are cheap and match spiky use, but make performance depend on history.", "Per-volume credits versus a shared pool across an account: per-volume is simple and isolates, while pooled credits use idle capacity better but are harder to explain."],
    p: ["A long benchmark exhausts credits and reports a figure that real steady use cannot reach.", "Overcommitted bursts across many volumes at once exceed what the nodes can serve."],
    v: "Idle a volume until credits are full, run at the burst rate and record when throughput drops to baseline. Confirm the time matches credits divided by the burst-minus-baseline rate, and a credit metric shows zero.",
    dep: ["iops-rate-limiter", "volume-metrics"]
  },
  "tail-latency-hedging": {
    s: "Reduces slow outliers by sending a second copy of a read to another replica when the first is slower than usual, using whichever answers first.",
    d: "The frontend tracks typical latency per replica. If a read has not completed by a threshold, such as a high percentile, it sends the same read to another replica and takes the first reply. This trims the tail created by one busy drive or node. Writes are not hedged the same way because duplicates need care. Hedges are capped to limit extra load. The hard part is avoiding self-inflicted overload: hedging when the whole system is slow doubles the load and makes things worse, so it backs off when many requests are slow.",
    k: ["Hedging after a latency threshold versus sending every read to two replicas: thresholds add little load, while duplicating everything cuts latency but halves effective read capacity.", "Hedging reads only versus also writes: reads are idempotent and safe, while hedged writes need versioning to remain correct."],
    p: ["Hedging during a fleet-wide slowdown amplifies load and deepens the slowdown.", "A threshold set below normal latency turns hedging into permanent duplication."],
    v: "Slow one replica by 50 ms for a share of reads, then compare the 99th-percentile latency with hedging off and on. Confirm it drops while extra read traffic stays under the configured cap.",
    dep: ["read-path", "request-router", "latency-histograms"]
  },
});
