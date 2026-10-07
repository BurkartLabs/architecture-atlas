// Details for the IoT fleet plate, part 3: telemetry ingestion, protocols and broker, edge gateways.
ATLAS.details("iot-fleet", {
  "ingestion-pipeline": {
    s: "The path telemetry takes from the broker to storage and consumers: decoding, validation, enrichment, routing and delivery, built to absorb bursts without dropping data.",
    d: "Messages leave the broker through a durable log that decouples receiving from processing. Workers read from the log in parallel, partitioned by device id so one device's messages stay in order. Each message is decoded, checked against its schema, enriched with registry attributes such as tenant and model, and delivered to the time-series store, the rules engine and the archive. Failures go to a dead-letter store with the reason. The difficulty is throughput under bursts and keeping each stage independently scalable and replayable.",
    k: ["A durable log between broker and processors vs direct processing: the log absorbs bursts and allows replay after a bug, but adds latency and a component to run.", "Partitioning by device vs by message type: device partitioning preserves per-device order, but a chatty device can overload one partition."],
    p: ["A slow downstream store backs up the whole pipeline when stages share one queue with no isolation.", "Dead-letter messages pile up unreviewed, and a decoding bug silently discards a whole device class."],
    v: "Send 1 million messages in a minute from test devices, stop the store for five minutes, and confirm that after it returns every message appears once, in per-device order, with none lost or in dead-letter.",
    dep: ["payload-decoding","data-quality-validation","rules-and-routing","backpressure-and-buffering","topic-namespace"]
  },
  "payload-decoding": {
    s: "Turns the compact binary or text bytes devices send into named, typed, unit-tagged fields that the rest of the platform understands.",
    d: "Constrained devices send small formats: fixed binary layouts, tagged binary encodings or compact text. A decoder selected by device type and payload version converts them to a common structured form with timestamps and units. Decoders are configuration or small sandboxed functions supplied by device makers, and are versioned along with firmware. Unknown versions are routed aside rather than guessed. The difficulty is the zoo: a fleet carries many firmware generations at once, and a decoder that mishandles byte order silently produces plausible but wrong numbers.",
    k: ["Decoding in the cloud vs on the edge gateway: cloud decoding keeps gateways simple and updatable in one place, but wastes bandwidth if raw payloads are large and verbose.", "Self-describing formats vs schema-by-reference: self-describing payloads are robust to change but larger; schema-by-reference is compact but breaks when versions are mismatched."],
    p: ["A firmware change that adds a field in the middle of a binary layout shifts every later value in old decoders.", "User-supplied decoder code with no resource limits stalls the pipeline with an infinite loop."],
    v: "Feed captured payloads from each firmware generation through the decoder and compare every field with values recorded by an independent reference tool. Feed an unknown version and confirm it is set aside, not mis-decoded.",
    dep: ["telemetry-schema-registry","device-types-and-models"]
  },
  "telemetry-schema-registry": {
    s: "A versioned catalog of message formats and field definitions, with units and ranges, shared by devices, decoders, validation and consumers.",
    d: "Each device type publishes one or more schemas for telemetry and events, identified by name and version. Producers reference the version, and consumers look it up. Compatibility rules, such as only adding optional fields, are enforced when a new version is registered, so a change cannot break existing consumers. The registry also records semantic information: units, whether a value is a counter or a gauge, and the sampling interval. The difficulty is governance, since dozens of teams define fields and similar names with different meanings accumulate.",
    k: ["Enforced compatibility on registration vs review by convention: enforcement prevents breaking consumers automatically, but sometimes blocks a justified break that needs a new stream.", "Central registry vs schemas shipped with each application: central schemas ensure one meaning per field, but add a lookup dependency and a bottleneck for change."],
    p: ["Two teams use the same field name with different units, and a dashboard averages them.", "Removing a deprecated field breaks a consumer nobody knew still used it."],
    v: "Register a new schema version that removes a required field and confirm the registry rejects it. Register a compatible one and confirm both old and new devices decode and validate correctly in a running pipeline.",
    dep: ["device-types-and-models"]
  },
  "data-quality-validation": {
    s: "Checks on each reading for plausibility, completeness and timing, so bad values are flagged, corrected or excluded before anyone relies on them.",
    d: "Validation applies schema type and range checks, rate-of-change limits, duplicate detection by device and sequence number, and timestamp sanity checks against receipt time. Suspect values are kept but marked with a quality flag, so a faulty sensor is visible instead of hidden. Counters are checked for resets, which are normal after a reboot. Late and out-of-order data are accepted within a window. The difficulty is that real physical events look like errors: a sudden temperature spike may be a fire, not a faulty sensor.",
    k: ["Flag suspect values vs drop them: flagging preserves evidence and lets consumers choose, but every consumer must handle the flag correctly.", "Check against receipt time vs device time: device time reflects when it happened, but device clocks are wrong often; receipt time is reliable but includes delay."],
    p: ["A device whose clock reset to 1970 writes data into the past, polluting the oldest partitions.", "Dropping out-of-range readings hides a failing sensor that the maintenance team needs to see."],
    v: "Send readings with duplicates, a clock jump, a counter reset and an out-of-range value from a test device. Confirm duplicates collapse, the others are stored with specific quality flags, and none silently disappear.",
    dep: ["telemetry-schema-registry","time-synchronization"]
  },
  "rules-and-routing": {
    s: "Declarative rules that match incoming messages and forward them to storage, other topics, functions or external systems, with optional transformation.",
    d: "A rule has a selector over topic and content, optional field mapping, and one or more actions. It is evaluated on every message in the ingestion path, so it is compiled and indexed to avoid scanning all rules per message. Typical actions are write to the time-series store, republish to a topic, call a function, or send to an archive. Rules are tenant-scoped and have error handling that routes failures aside. The difficulty is volume: a poorly written rule on a million-message-per-second stream becomes the most expensive thing on the platform.",
    k: ["Declarative rules vs custom code for every flow: rules are safe, inspectable and fast, but cover only common transformations; code is flexible and unbounded in cost.", "Evaluate all matching rules vs the first match: all matches support fan-out, but make cost and ordering harder to predict."],
    p: ["A rule that republishes to a topic it also matches creates an infinite loop that saturates the broker.", "An error in one action stops later actions for the same message unless failures are isolated per action."],
    v: "Create a rule routing temperature readings above 80 to an alert topic and all readings to storage. Send a mix of values and confirm exact matches on both outputs, and a deliberately looping rule is rejected or throttled.",
    dep: ["ingestion-pipeline","topic-namespace","multi-tenancy"]
  },
  "stream-processing": {
    s: "Continuous computation over telemetry streams: windowed aggregates, joins with device attributes, thresholds over time and derived events.",
    d: "Stream jobs read from the ingestion log, keep state such as running windows per device, and emit results such as a five-minute average, an event for a sustained threshold breach, or a count of devices in a state. State is checkpointed so a restart resumes without double counting. Late events are handled by watermarks that define how long to wait. Results feed alerts, dashboards and the shadow. The difficulty is correct time handling and state size across millions of devices.",
    k: ["Event time vs processing time for windows: event time gives correct results despite delays, but requires watermarks and some waiting; processing time is simple and wrong after any backlog.", "Exactly-once state updates vs at-least-once with idempotent outputs: exactly-once is convenient but costly; idempotent sinks are cheaper and usually enough."],
    p: ["Per-device state with no expiry grows without bound as devices are retired and re-created.", "A long outage replay emits thousands of duplicate alerts when downstream sinks are not idempotent."],
    v: "Feed a recorded stream with known late and out-of-order readings and confirm window results equal a batch recomputation of the same data. Kill a worker mid-run and confirm no window is double counted.",
    dep: ["ingestion-pipeline","hot-time-series-store"]
  },
  "backpressure-and-buffering": {
    s: "Mechanisms that slow, queue or shed load when a stage cannot keep up, so overload becomes delay in a controlled place instead of data loss.",
    d: "Each stage has bounded queues and signals its upstream when full. The broker can slow devices by delaying acknowledgements or rejecting new connections with a retry-after hint. Durable logs hold the backlog, and lower-priority streams are shed first. Devices keep their own buffers and retry with jitter. The principle is to decide deliberately what happens when capacity is exceeded. The difficulty is that the safest place to buffer is at the devices, which are the least controllable.",
    k: ["Buffering in a durable log vs rejecting at the edge: buffering preserves everything at storage cost; rejecting protects the platform but depends on devices keeping data.", "Priority classes for traffic vs first come first served: priorities keep alarms flowing during overload, but starve routine data and need clear definitions of importance."],
    p: ["Unbounded in-memory queues turn a slow store into an out-of-memory crash and lose everything queued.", "Retrying devices without jitter synchronize and hit the recovering platform as a wall."],
    v: "Throttle the store to 10 percent of normal while sending peak load. Confirm queues stay bounded, alarm-priority messages keep their latency, routine data is delayed rather than dropped, and the system recovers unaided.",
    dep: ["ingestion-pipeline","rate-limits-and-quotas","reconnect-storm-control"]
  },
  "hot-time-series-store": {
    s: "Storage optimized for recent device readings: fast appends, queries by device and time range, and aggregations for dashboards and rules.",
    d: "Data is written in time-ordered chunks per device or series, compressed using the regularity of timestamps and values, and indexed by series and time. Recent data is held in memory and fast storage. Queries ask for one device's last hour or an aggregate across a group over a day. Cardinality, the number of distinct series, is the main limit on cost. Retention and downsampling move data out. The difficulty is the write rate, since millions of devices produce a steady stream of small writes.",
    k: ["Series per metric per device vs wide rows per device: per-series layouts compress well and query one metric fast, but multiply the series count and metadata.", "Time-based partitions vs device-based: time partitions make retention trivial and recent queries fast, but cross-device history queries touch many partitions."],
    p: ["Out-of-order writes into already compressed chunks are slow or rejected, and break backfills.", "A tag with unbounded values, such as a request id, explodes cardinality and crashes the index."],
    v: "Write one billion points across 1 million series, then query the last hour of one device and a daily mean for a group. Confirm both return within their latency targets and a late write for yesterday is accepted.",
    dep: ["ingestion-pipeline","downsampling-and-retention"]
  },
  "cold-archive": {
    s: "Cheap, durable, long-term storage of raw messages and logs in open columnar or object formats, for audits, reprocessing and analytics.",
    d: "A copy of raw or lightly decoded data is written in large batches to object storage, partitioned by tenant and date, in a compressed columnar format that analytics engines read directly. The archive is the source for backfills when a decoder bug is fixed and for training models. It is immutable apart from retention deletion and encrypted per tenant. The difficulty is making deletion real: data subject requests and contractual retention must reach every copy, including backups and derived tables.",
    k: ["Archive raw payloads vs only decoded data: raw payloads allow reprocessing after a decoder bug, but cost more and may include data decoded fields would drop.", "Many small files vs batched large ones: small files give lower latency to availability, but make later scans slow; batching delays visibility."],
    p: ["The archive lacks a device identifier mapping, so a deletion request cannot find a person's data.", "Small files from frequent flushing make analytics queries ten times slower than needed."],
    v: "Re-run the pipeline from archived raw data for one day and compare the stored time series with the original. Execute a deletion for one device and confirm no archived record remains after the documented delay.",
    dep: ["ingestion-pipeline","encryption-and-tenant-isolation"]
  },
  "downsampling-and-retention": {
    s: "Policies that keep full-resolution data for a short time, then replace it with summaries and finally delete it, to keep storage cost proportional to value.",
    d: "Rollup jobs compute aggregates such as minimum, maximum, mean and count per interval, store them in coarser tables, and drop the raw points after their retention. Policies are set per data class and tenant. Dashboards pick the resolution that matches the time range requested. Some data, such as alarms, is retained at full resolution longer. The difficulty is that downsampling discards information permanently, and averages of averages are wrong without keeping counts.",
    k: ["Keep min, max and count with the mean vs the mean only: richer summaries preserve spikes and allow correct re-aggregation, but triple storage for rollups.", "Retention by data age vs by value: age-based rules are simple and predictable; value-based rules keep rare interesting periods but need classification."],
    p: ["Averaging over an hour hides a ten-second spike that was exactly the fault being investigated.", "A retention change applied without notice deletes data a customer's contract requires."],
    v: "Insert a ten-second spike into a test series, wait past the raw retention, and confirm the hourly rollup still shows the spike in its maximum and its count matches the number of raw points.",
    dep: ["hot-time-series-store"]
  },
  "mqtt-endpoint": {
    s: "The publish and subscribe endpoint where most devices hold a long-lived, TLS-protected connection, speaking a lightweight messaging protocol designed for unreliable networks.",
    d: "Devices connect over TCP with TLS, authenticate with a certificate or token, and keep the connection open with periodic keepalives. They publish to topics and subscribe to filters. The endpoint terminates TLS, checks authentication and topic permissions, and hands messages to the broker core. It handles millions of idle connections, so memory per connection and connection-establishment rate are the main limits. The difficulty is the reconnect: after any outage every device returns within seconds.",
    k: ["Long-lived connections vs periodic short connections: long-lived connections give low latency and server push, but cost memory per device; periodic connections save power on battery devices and add delay.", "Terminating TLS in the broker vs at a load balancer: broker termination allows device identity inside the broker, but a balancer offloads handshake cost."],
    p: ["Many devices configured with the same client identifier keep kicking each other off the broker in a loop.", "Short keepalives on cellular links cause constant radio wake-ups that drain batteries and inflate data bills."],
    v: "Open 1 million idle test connections and confirm memory stays within budget. Connect two clients with one identifier and confirm the older is disconnected with a reason, not a silent loop.",
    dep: ["mutual-tls-termination","topic-authorization","broker-cluster","session-and-qos"]
  },
  "coap-endpoint": {
    s: "A request and response endpoint over datagrams for very constrained devices that cannot afford a persistent connection, with optional observation of resources.",
    d: "Devices send small confirmable or non-confirmable messages over UDP, optionally secured with datagram TLS. The endpoint maps resource paths to platform operations, such as posting telemetry or fetching a configuration, and supports observing a resource so the device is notified of changes. Because there is no connection, the server cannot easily reach a sleeping device; devices poll or hold a registration. The difficulty is NAT: the path to a device through a carrier's translation expires in minutes, so pushes silently fail.",
    k: ["Datagram protocol vs connection-based: datagrams cost fewer bytes and need no handshake state, but lose delivery guarantees and server-initiated reachability.", "Secured datagrams with session resumption vs unsecured: resumption keeps wake-ups cheap with security intact, but the server must hold session state per device."],
    p: ["A NAT binding that expires silently means commands to a sleeping device never arrive and no error is reported.", "Unauthenticated UDP endpoints are used for traffic amplification attacks against third parties."],
    v: "Send a confirmable message from a test device behind a translating gateway and confirm the acknowledgement. Wait past the NAT timeout, push a notification, and confirm the platform detects non-delivery and falls back to polling.",
    dep: ["topic-authorization","rate-limits-and-quotas"]
  },
  "http-ingress": {
    s: "A plain request interface for devices and gateways that cannot hold a messaging connection, such as those behind strict proxies or sending batched uploads.",
    d: "Devices post readings and fetch configuration, commands and firmware over HTTP with TLS, authenticating with a certificate or a signed token. Batching sends many readings in one request to save radio time. The server maps it to the same internal message format as other protocols. Long polling or a periodic check-in provides command delivery. The difficulty is that every request pays connection and header overhead, and servers see load as a spike of requests whenever many devices share a schedule.",
    k: ["Request-based devices vs persistent connections: requests work through proxies and sleep between calls, but cannot receive pushes and cost more bytes per message.", "Large batches vs frequent small posts: large batches save energy, but delay data and risk losing a whole batch on a failure."],
    p: ["Devices all configured to post at the top of the hour overload the endpoint on the hour.", "Retries after a timeout without an idempotency key store the same batch twice."],
    v: "Post the same batch twice with one idempotency key and confirm it is stored once. Spread 100,000 test devices with a randomized offset and confirm the peak request rate stays below the endpoint capacity.",
    dep: ["mutual-tls-termination","ingestion-pipeline","rate-limits-and-quotas"]
  },
  "device-management-protocol": {
    s: "A standard protocol for managing constrained devices: object models for settings, firmware update and diagnostics, with registration and notifications, used where vendors must interoperate.",
    d: "Devices register with a management server, exposing a tree of numbered objects and resources such as firmware, connectivity and device information. The server reads, writes and executes against these, and observes values for change. Transport is usually the datagram protocol or a messaging link. A standard object model lets one platform manage hardware from different makers without custom code. The difficulty is the gap between the standard and real devices, which implement subsets and extensions with their own quirks.",
    k: ["Standard management objects vs a proprietary schema: standards allow mixed-vendor fleets and shared tooling, but cover only common features and are verbose for custom ones.", "Server-initiated reads vs device-reported values: reads give control, but need reachability; reports are simpler to deliver through restrictive networks."],
    p: ["Devices that implement the standard only partially cause generic tooling to fail on missing objects.", "Registration lifetimes that expire during a network outage leave the server unable to reach devices that are actually fine."],
    v: "Register a test device from each vendor, read the device information and firmware objects, and confirm values match the device's own report. Expire a registration and confirm the server marks it unreachable without deleting it.",
    dep: ["coap-endpoint","device-registry"]
  },
  "topic-namespace": {
    s: "The naming scheme for message channels: how topics are structured by tenant, device and purpose, so permissions, routing and subscriptions stay predictable.",
    d: "A convention such as tenant, device id, then a purpose like telemetry, events, commands or shadow, is applied uniformly. Reserved prefixes carry platform services, and wildcards allow subscribing to a family. The namespace is the unit of authorization: a device is permitted only its own subtree. A good scheme makes policies short and rules selective; a bad one forces long lists of exceptions. The difficulty is that topics are effectively an API shipped inside firmware, so changing them later means updating the fleet.",
    k: ["Device identity in the topic vs in the payload: identity in the topic lets the broker enforce permissions without parsing messages, but long topics cost bytes and the id must match the credential.", "Fine-grained topics per message type vs few topics with typed payloads: fine topics route cheaply, but multiply subscriptions on devices."],
    p: ["A device allowed to subscribe to a wildcard receives other devices' messages.", "Topic names baked into old firmware prevent renaming and force the platform to carry aliases forever."],
    v: "Connect as one test device and attempt to publish and subscribe to a sibling device's topics and to a broad wildcard. Every attempt outside its own subtree must be denied and logged.",
    dep: []
  },
  "session-and-qos": {
    s: "Per-connection delivery guarantees: at most once, at least once or exactly once, and persistent sessions that keep subscriptions and queued messages across disconnects.",
    d: "Each publish carries a quality level. At the middle level the sender retries until acknowledged, so receivers may see duplicates. A persistent session stores subscriptions and undelivered messages while the device is away, up to a limit and an expiry. Message identifiers in flight are bounded per connection. The highest level adds a handshake that costs extra round trips and state. The difficulty is that each guarantee costs energy and server memory per device, and most applications are better served by idempotent messages at the middle level.",
    k: ["At least once with idempotent handlers vs exactly once: at least once is cheap and robust, and moves duplicate handling into the application; exactly once costs round trips and state on every message.", "Persistent sessions vs clean sessions: persistent sessions queue messages for sleeping devices, but accumulate backlog for devices that never return."],
    p: ["Persistent sessions for retired devices accumulate queued messages indefinitely and exhaust broker storage.", "Treating the middle level as exactly once makes a duplicated command run twice."],
    v: "Publish at the middle level, drop the acknowledgement, and confirm a retried copy is delivered and detectable by message id. Disconnect a persistent-session device, publish ten messages, reconnect, and confirm all ten arrive.",
    dep: ["mqtt-endpoint","broker-cluster"]
  },
  "retained-and-last-will": {
    s: "Two broker features for state: a retained message that new subscribers receive immediately, and a last-will message the broker publishes when a device disappears unexpectedly.",
    d: "A retained message is stored per topic and sent to anyone who subscribes later, so a subscriber learns the current value without waiting for the next report. A device registers a will at connect time, which the broker publishes if the connection drops without a clean disconnect, which is how offline status is announced. Typically a device publishes online when connecting, with a retained flag, and the will replaces it with offline. The difficulty is stale retained data left after a device is gone, and wills not firing on broker failures.",
    k: ["Retained status messages vs asking the registry: retained messages are instantly available to any subscriber, but can persist indefinitely and diverge from the registry.", "Last-will for presence vs keepalive timeout events only: wills let other devices learn of a failure through the same channel, but fire only if the broker itself stays up."],
    p: ["A retained message for a decommissioned device keeps showing it as online forever.", "A broker crash loses wills, so devices appear online until they reconnect and publish again."],
    v: "Connect a device with a will, kill its network without a clean disconnect, and confirm subscribers receive the offline message after the keepalive timeout. Subscribe afterward and confirm the retained offline value is delivered.",
    dep: ["mqtt-endpoint","session-and-qos"]
  },
  "broker-cluster": {
    s: "Many broker nodes acting as one, sharing subscriptions and routing messages between them, so connections and throughput scale horizontally and survive node failures.",
    d: "Devices connect to any node through a load balancer. Each node knows which subscriptions exist cluster-wide and forwards messages to nodes holding matching subscribers. Session state and retained messages are replicated or stored in a shared service. Nodes are added and removed with connections rebalanced gradually. The cluster must tolerate network partitions. The difficulty is the cost of a node failure: all of its devices reconnect elsewhere at once, which is a miniature reconnect storm against the survivors.",
    k: ["Replicated subscription tables vs a shared external store: replication gives fast local routing, but costs memory and synchronization; an external store simplifies nodes and adds lookup latency.", "Sticky load balancing by device vs round robin: stickiness keeps a device on a warm node and eases session lookup, but unbalances after failures."],
    p: ["A partition leaves two halves each accepting the same client identifier, so one device has two sessions.", "Losing one node of three pushes the remaining two beyond their connection capacity, causing a cascade."],
    v: "With 3 nodes under load, kill one and confirm its devices reconnect within the target time, no retained message is lost, and surviving nodes stay below capacity. Restore it and confirm connections rebalance gradually.",
    dep: ["connection-registry","reconnect-storm-control"]
  },
  "connection-registry": {
    s: "A fast, shared map from device id to its current connection: which broker node, which session, since when, and with what protocol.",
    d: "On connect, the broker records the device's session and node, evicting any older session for the same identity. On disconnect, the entry is removed or marked. Services use the registry to route a command to the right node, to answer whether a device is online, and to enforce one connection per identity. It must handle millions of updates per minute during storms and recover its content after a restart. The difficulty is correctness under races: a late disconnect from an old session must not erase a newer connection.",
    k: ["Session token comparison on every update vs trusting arrival order: comparing tokens makes races harmless, but requires every writer to carry the session identity.", "Registry in memory with periodic snapshots vs always durable: in-memory is fast enough for storms, but must be rebuilt from reconnecting devices after a crash."],
    p: ["A delayed disconnect event from an old session marks a freshly connected device offline.", "After a registry restart, devices appear offline until they reconnect, and alerts fire for the whole fleet."],
    v: "Connect a test device twice in quick succession from two sources, deliver the first session's disconnect late, and confirm the registry still shows the second session as the connected one.",
    dep: ["mqtt-endpoint"]
  },
  "topic-authorization": {
    s: "Policies that decide which topics each identity may publish to and subscribe from, evaluated by the broker at connection and for each operation.",
    d: "Policies are attached to device identities, groups or certificate attributes and written with variables, so one policy covers all devices: allow publish to the topic subtree matching the connecting identity. The broker caches the decision per connection and reevaluates when a policy changes or a session continues across a reconnect. Deny rules take precedence. The difficulty is correctness at scale, since a mistake in one shared policy grants access to the entire fleet, and cached decisions can outlive a revocation.",
    k: ["Policy variables substituting device identity vs one policy per device: variables keep policies few and auditable, but a wrong variable grants cross-device access broadly.", "Cache decisions for the connection vs check each operation: caching is fast at message rates, but delays the effect of a change until reconnect or an invalidation."],
    p: ["A wildcard in a shared policy lets every device publish into every other device's command topic.", "Policy changes do not affect devices already connected until they happen to reconnect."],
    v: "Change a policy to deny a topic while a test device is connected and confirm its next publish is refused within the stated propagation delay and logged. Test cross-device access with a deliberately wrong identity.",
    dep: ["device-identity","topic-namespace","fleet-groups"]
  },
  "rate-limits-and-quotas": {
    s: "Caps on connection attempts, message rates, payload sizes and subscriptions, per device and per tenant, protecting shared capacity from faulty or hostile senders.",
    d: "Limits are enforced at the endpoint using token buckets keyed by device and tenant. Exceeding a limit leads to throttling, a rejection with a retry hint, or disconnection for repeat offenders. Different limits apply to different classes: alarms may bypass the normal rate. Quotas also cap total devices and stored data per tenant. The difficulty is calibration and communication: devices need to receive a clear signal and back off, otherwise they retry harder and make the problem worse.",
    k: ["Per-device limits vs per-tenant limits only: per-device limits contain a single buggy unit, but add state for every device; tenant limits are cheap and let one device starve its siblings.", "Disconnect on violation vs drop silently: disconnecting is visible and stops the abuse, but triggers reconnects; dropping wastes capacity and hides the cause from the device."],
    p: ["A firmware bug sending in a loop consumes the tenant's whole allowance in minutes and silences its other devices.", "Limits that reject without a retry-after hint cause tight retry loops."],
    v: "Make one test device exceed its message rate and confirm it is throttled with a retry hint while other devices of the tenant are unaffected, and that the event shows in metrics with the device id.",
    dep: ["mqtt-endpoint","multi-tenancy"]
  },
  "edge-gateway": {
    s: "A local computer that connects nearby devices and the cloud, translating protocols, buffering data, applying rules and acting as the devices' representative to the platform.",
    d: "A gateway sits at a site, building or vehicle. Local devices connect to it over short-range radios, serial buses or a site network, and it connects upstream over one secured link. It authenticates itself and the devices behind it, aggregates and filters data, and keeps working when the uplink fails. It is itself a managed device with firmware, certificates and health. The difficulty is multiplicity: a gateway is both a single device and a proxy for many, and its failure silences all of them.",
    k: ["Gateway as a proxy for dumb devices vs smarter devices connecting directly: gateways save cost and power per device, but add a single point of failure and a second thing to update.", "Gateway-level identity only vs per-device identity through the gateway: gateway-only identity is simple, but the cloud cannot tell which device a message truly came from or revoke one."],
    p: ["When a gateway fails, all of its devices look offline though they are working and storing data locally.", "A gateway with one shared credential for all devices behind it makes revoking a single compromised sensor impossible."],
    v: "Unplug the uplink of a test gateway with 20 devices for an hour, and confirm local operations continue, data is buffered, and all devices appear as unreachable via the gateway, not individually failed.",
    dep: ["local-protocol-adapters","store-and-forward","gateway-device-proxy","device-update-agent"]
  },
  "local-protocol-adapters": {
    s: "Drivers on the gateway for the field protocols local devices speak, translating them to the platform's message format and back.",
    d: "Each adapter handles one family of local protocols: short-range wireless meshes, serial industrial buses, building automation and others. It discovers devices, polls or subscribes to them, maps registers or attributes to named fields with units, and applies commands in the other direction. Adapters are plugins updated independently of the gateway core. Polling intervals and timeouts are configured per device type. The difficulty is the variety and slowness of field buses, and that a stuck device on a shared bus can stall readings from all others.",
    k: ["Polling devices on a schedule vs event-driven subscriptions: polling is universal and predictable, but wastes bandwidth and misses short events; events are efficient where supported.", "Adapters as separate processes vs libraries in the gateway: separate processes isolate crashes, but cost memory on small gateways."],
    p: ["One misbehaving device that never answers blocks the bus polling loop and delays all readings.", "A mapping with the wrong scale factor produces consistent, plausible, wrong values for a whole device model."],
    v: "Attach a real device of each supported type, read each mapped field and compare against the device's own display or tool. Disconnect one device on a shared bus and confirm others keep their polling cadence.",
    dep: ["edge-gateway","device-types-and-models"]
  },
  "gateway-device-proxy": {
    s: "The cloud representation of devices behind a gateway: each gets its own registry entry, shadow and topics, though traffic flows through the gateway's connection.",
    d: "The gateway announces which downstream devices exist and publishes on their behalf using per-device topics. The platform authorizes the gateway for exactly those devices and tracks both the gateway's and each device's status. Commands to a downstream device go to the gateway, which forwards them locally. Devices can be given their own identity or only be known by the gateway's attestation. The difficulty is state: when the gateway reconnects, it must reconcile the device list, and what the cloud believes about each device may differ.",
    k: ["Each downstream device is a first-class registry entry vs only gateway attributes: first-class devices get shadows, groups and permissions, but multiply registry size and sync work.", "Gateway-attested membership vs cloud-defined membership: gateway attestation handles discovery automatically, but a compromised gateway can invent devices."],
    p: ["Devices moved from one gateway to another leave duplicate or orphaned records behind.", "The gateway's disconnect marks hundreds of devices offline at once and fires an alert for each."],
    v: "Add a device behind a test gateway and confirm it appears in the registry attached to the gateway. Move it to another gateway and confirm one record remains, with history intact, and only the new gateway may speak for it.",
    dep: ["edge-gateway","device-registry","device-shadow"]
  },
  "store-and-forward": {
    s: "Local persistence of readings and events while the uplink is down, then ordered, rate-limited delivery after reconnection with deduplication.",
    d: "The gateway or device writes outbound messages to a durable local queue with sequence numbers and original timestamps. After the link returns, the queue drains oldest first or newest first by policy, at a rate that does not trigger throttling. The receiving side removes duplicates using device and sequence ids. The queue has a size cap and an overflow policy, such as dropping low-priority data first or summarizing it. The difficulty is flash wear and finite space: a long outage forces a choice about which data to lose.",
    k: ["Oldest-first drain vs newest-first: oldest-first keeps the record complete and ordered, but delays current values; newest-first restores live visibility quickly and backfills history later.", "Drop oldest on overflow vs drop newest: dropping oldest keeps recent information, but opens a gap at the start of the outage that cannot be refilled."],
    p: ["Constant writes to a small flash queue wear it out, and the device fails in the field after a year.", "Draining at full speed after reconnection triggers the platform's rate limit and loses data."],
    v: "Disconnect a test gateway for six hours with a known message count, reconnect, and confirm every message arrives once, in order for each device, with original timestamps, without hitting the platform rate limit.",
    dep: ["local-persistence","backpressure-and-buffering","edge-gateway"]
  },
  "local-rules-and-inference": {
    s: "Logic running on the gateway or device that decides locally, such as thresholds, interlocks and small models, so important responses do not depend on the cloud.",
    d: "Rules and models are deployed from the cloud as signed packages, executed in a sandbox with limited resources, and can read local sensor values and actuate local outputs. They reduce data sent upstream by filtering or summarizing, and they protect safety functions from network failure. Results and key decisions are reported to the cloud. Models are versioned and rolled out like firmware. The difficulty is keeping local logic consistent with the cloud's and verifying that the thousands of copies are the intended version.",
    k: ["Decide locally vs decide in the cloud: local decisions are fast and survive outages, but are harder to update and observe; cloud decisions are easy to change but depend on the link.", "Raw data upstream vs local summaries: summaries cut bandwidth and cost, but lose the raw evidence needed for later investigation."],
    p: ["Different gateways run different rule versions after a partial rollout, and behavior differs between sites without anyone noticing.", "A local model drifts as conditions change and nothing reports its accuracy back."],
    v: "Disconnect a test gateway and trigger a threshold condition. Confirm the local rule actuates within its required time, the decision is logged locally, and it is reported with the rule version after reconnection.",
    dep: ["edge-gateway","store-and-forward","device-update-agent"]
  },
  "presence-and-keepalive": {
    s: "How the platform and devices detect that the other side is still there, using periodic keepalive messages, timeouts and acknowledged heartbeats.",
    d: "A keepalive interval is negotiated at connection. If no traffic arrives within about one and a half intervals, the broker declares the connection dead and publishes the offline status. Devices send a small ping when idle. The interval trades detection speed against battery and data use, and carrier networks may drop idle connections sooner than the interval, so it is chosen below the carrier's timeout. The difficulty is distinguishing a dead device from a quiet one, and a dead network path from a dead broker.",
    k: ["Short keepalives vs long ones: short intervals detect loss and keep carrier bindings open, but cost power and data on thousands of devices; long ones save energy and delay detection.", "Device-selected interval vs platform-mandated: device choice fits each power budget, but a single bad value can hold dead connections for hours."],
    p: ["An interval longer than the carrier's idle timeout makes the connection silently dead while both sides believe it is up.", "A keepalive set to zero disables detection and leaves ghost sessions on the broker indefinitely."],
    v: "Set a 60 second keepalive, pull the network from a test device, and confirm offline is declared between 60 and 120 seconds. Verify the same device on a carrier network holds its connection beyond the carrier's idle timeout.",
    dep: ["mqtt-endpoint","connection-registry"]
  },
  "reconnect-storm-control": {
    s: "Measures that prevent every device from reconnecting at the same moment after an outage, using randomized backoff, admission limits and staged recovery.",
    d: "Devices retry with exponential backoff and random jitter. The broker admits connections at a limited rate and tells the rest to try again later, ideally with a delay hint. Expensive work at connect, such as shadow sync and queued-command delivery, is rate-limited separately from the handshake. Operators can drain a region deliberately. The difficulty is that the worst case is also the most likely: a power or carrier outage returns millions of devices simultaneously, and the recovering platform is the weakest it will ever be.",
    k: ["Admission control at the broker vs relying on device backoff: admission control protects the platform from badly written firmware, but needs capacity to reject cheaply; backoff relies on every firmware version being correct.", "Delay hints from the server vs fixed client schedules: server hints adapt to current load, but old firmware may ignore them."],
    p: ["Backoff with no jitter makes devices retry in lockstep and the platform sees repeated waves.", "The reconnect handshake triggers full shadow and queue sync for each device, which costs more than the connection itself."],
    v: "Drop and restore 500,000 test connections at once and confirm the broker admits them at its configured rate, no node is overloaded, and all devices are connected within the target time without manual intervention.",
    dep: ["mqtt-endpoint","reconnect-backoff","broker-cluster"]
  },
  "network-and-sim-management": {
    s: "Management of the cellular or other network subscriptions devices use: activation, usage, plan limits, carrier selection and detection of misuse.",
    d: "Each device with a cellular modem has a subscriber identity module with its own identifier and plan. The platform maps these to device records, monitors data usage per device, pools allowances across the fleet, and can suspend or throttle a line. It also tracks signal quality and which carrier the device is attached to. Private networks and fixed addresses allow restricting traffic to the platform only. The difficulty is cost: a few misbehaving devices can use the whole pooled allowance, and a lost device with a working subscription keeps running up charges.",
    k: ["Connectivity bundled with the platform vs a separate carrier contract: bundling simplifies activation and cost tracking, but ties the fleet to one provider's coverage.", "Private network to the platform only vs public internet access: private access sharply limits abuse and attack surface, but needs carrier setup and complicates roaming."],
    p: ["A device stuck in a retry loop consumes the monthly pool in days and fees for overage follow.", "Subscriptions of decommissioned devices stay active and billed because the two systems are not linked."],
    v: "Trigger a high-usage condition on a test device and confirm usage alerts fire at the set threshold, the line can be suspended through the API, and the platform shows the suspended state and reason in the device record.",
    dep: ["device-registry","fleet-health-metrics"]
  },
  "time-synchronization": {
    s: "Keeping device clocks correct, so timestamps on data, certificates, schedules and logs mean the same thing across the fleet.",
    d: "Devices without a battery-backed clock start from an unknown time after power loss. They obtain time from the platform at connection, from a network time service or from satellite positioning, and keep it with a local oscillator that drifts. Timestamps are recorded with an indication of quality, such as synced or estimated. Certificate validation needs approximately correct time, which creates a circular problem on a device with a wrong clock. The difficulty is that trust in time affects security and data correctness.",
    k: ["Time from the platform at connect vs from an independent source: platform time needs no extra radio or protocol, but depends on the connection; an independent source works offline but costs power and parts.", "Recording device time with a quality flag vs only server receipt time: device time shows when it happened, but must be marked reliable or not."],
    p: ["A device with its clock at the epoch rejects every valid certificate as not yet valid and can never connect to fix itself.", "Data stamped with an unsynchronized clock appears decades in the past and breaks queries and retention."],
    v: "Power-cycle a test device with no backup clock and confirm it connects despite the wrong time, obtains correct time, and marks its pre-sync readings as estimated. Compare synchronized timestamps to a reference within the stated tolerance.",
    dep: []
  }
});
