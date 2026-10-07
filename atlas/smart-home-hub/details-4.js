// Details for the smart home hub plate, part 4: radios, security, platform.
ATLAS.details("smart-home-hub", {
  "low-power-mesh-radio": {
    s: "A 2.4 GHz low-rate radio in which mains-powered devices relay messages for each other, letting battery sensors and switches reach the hub across a house at tiny power cost.",
    d: "Devices form a mesh of routers, which stay awake and forward frames, and end devices, which sleep and talk through a parent router. Frames are small, encrypted at link and network level, and acknowledged hop by hop. Channels are chosen to avoid wireless LAN interference. It is hard because range depends on walls and on the number of routers, sleepy devices need messages buffered at their parent, and a mesh with too few or flaky routers partitions unexpectedly.",
    k: ["Mesh with routers vs star to the hub: a mesh extends range through the house, but depends on routers staying powered; a star is simpler, but needs a strong hub position.", "Sleepy end devices vs always-on: sleeping gives years of battery life, but commands wait for the next check-in and feel slow."],
    p: ["Switching off a smart bulb at the wall removes a router and cuts off the sensors behind it.", "Putting the mesh on a channel overlapping the wireless LAN causes retries and sluggish commands in the evening."],
    v: "Power off one router device and confirm affected end devices re-attach to another parent within the stated time and commands to them succeed, and measure round trip latency on a quiet channel.",
    dep: ["radio-coprocessor","mesh-network-manager","mesh-routing"]
  },
  "mesh-network-manager": {
    s: "The component that creates and administers the mesh: forming the network, holding its keys, admitting devices, tracking topology and repairing it when routers vanish.",
    d: "The manager is the coordinator: it selects a channel and network identifiers, generates and rotates keys, controls whether joining is permitted and keeps a table of devices with their roles and parents. It reads link quality and neighbor tables and can request route repair or a channel change. It is hard because the network state lives partly in the radio chip and partly on the host, and key rotation and channel changes must reach every device, including those asleep.",
    k: ["Rotate network keys periodically vs keep a fixed key: rotation limits damage from a leak, but stragglers that miss it fall off the network.", "Fixed channel vs automatic channel change: a fixed channel is stable, but cannot avoid new interference; changing needs every device to follow."],
    p: ["Changing the channel while some battery devices are asleep strands them with no way to find the new one.", "Coordinator state held only in the radio chip is lost when the chip is replaced, forcing re-pairing."],
    v: "Request a channel change on a mesh of twenty devices including sleepy ones and confirm every device is reachable on the new channel within the specified time, with a count of stragglers and their recovery.",
    dep: ["radio-coprocessor","device-key-store","embedded-database"]
  },
  "mesh-routing": {
    s: "How messages find a path across the mesh: routing tables, route discovery, link cost metrics and the fallback when a link dies.",
    d: "Routers keep neighbor tables and learn routes on demand or from periodic advertisements, using link quality to prefer reliable hops. A message to a distant device may use a source route given by the coordinator or hop-by-hop forwarding. Broadcast and multicast are flooded with limits. It is hard because home radios fluctuate, routing tables are small on cheap chips, and many devices reporting at once create broadcast storms that congest the channel.",
    k: ["Table-driven routing vs source routing: tables need no work by the sender, but use memory in every router; source routes use little router memory, but need the coordinator to track the topology.", "Flooding broadcasts vs unicast to each device: flooding is simple, but consumes shared airtime and scales badly."],
    p: ["A group command sent as a network-wide broadcast saturates the channel, and lights respond out of order.", "Stale routes to a removed device keep failing and are retried until the table expires."],
    v: "Unplug a router in the middle of a three-hop path and confirm traffic resumes over another path within the repair time and the lost-message count during repair is reported.",
    dep: ["low-power-mesh-radio","mesh-network-manager"]
  },
  "wifi-device-link": {
    s: "Devices that connect directly to the home wireless LAN and talk to the hub over IP, such as plugs, cameras and appliances.",
    d: "These devices join the router's network like any other, are found by discovery, and exchange messages over local network protocols, often with encryption and authentication from the commissioning step. They use more power than mesh devices but have high bandwidth. The hub keeps connections or polls and handles address changes. It is hard because the router is a shared resource the hub does not control: dozens of chatty devices exhaust its table, DHCP lease changes break addresses and a router replacement changes everything.",
    k: ["Direct local connection vs cloud-mediated control: local is fast and private, but needs the device to expose a local interface; cloud control works for any device, but depends on the internet.", "Fixed addresses vs name-based discovery: fixed addresses are simple, but break on router changes; names adapt, but depend on discovery working."],
    p: ["A router with a small connection table drops devices randomly once forty gadgets are joined.", "A device that changes its address makes the hub talk to a different device that took the old one."],
    v: "Change the router's address range, and confirm all wireless LAN devices are found again at their new addresses by identity within the target time and no command goes to a wrong device.",
    dep: ["local-discovery","protocol-adapters","network-segmentation"]
  },
  "ble-link": {
    s: "A short-range radio link used for first-time setup, for battery sensors that broadcast readings and for devices such as locks controlled from nearby.",
    d: "Devices advertise small packets that the hub or phone scans for, or accept connections for exchanging data. Setup uses connections and a secure pairing exchange; sensors often just broadcast measurements that scanners collect without connecting. Hubs extend range by placing proxies in several rooms. It is hard because range is a few meters, a single radio can serve only a few connections, and scanning shares the same antenna as the wireless LAN and the mesh.",
    k: ["Broadcast sensor readings vs connected sessions: broadcasts scale to many sensors and save power, but are unauthenticated unless encrypted; connections are secure, but limited in number.", "One central hub radio vs distributed proxies: proxies cover the house, but add devices to manage and secure."],
    p: ["A hub in a cabinet at the far end of the house misses sensors that never reach it.", "Unencrypted broadcast readings let a neighbor read or spoof the home's sensors."],
    v: "Place a broadcasting sensor in the farthest room and confirm the hub receives readings at the expected interval with proxies in place, and that a spoofed reading with a wrong key is discarded.",
    dep: ["coexistence-manager","protocol-adapters","local-discovery"]
  },
  "sub-ghz-radio": {
    s: "A sub-gigahertz radio for long-range, low-rate links to sensors and legacy devices such as alarm contacts, using lower frequencies that pass through walls well.",
    d: "These radios use frequency bands that depend on region and defined duty cycle limits. Devices send short messages with simple modulation, often one way, which keeps them cheap and long lived but limits security features. The hub listens with a dedicated receiver and decodes the vendor's frame format. It is hard because rules differ by region, messages may be unauthenticated and replayable, and nothing confirms delivery to one-way devices.",
    k: ["One-way transmitters vs two-way links: one-way is cheap and has long battery life, but gives no confirmation and weaker security; two-way adds acknowledgments and encryption.", "Dedicated receiver vs multi-protocol radio: dedicated is reliable, but adds hardware; multi-protocol saves cost, but shares timing."],
    p: ["Replaying a captured unlock or alarm-off frame works against links with no rolling codes.", "Region-specific frequency and power settings applied wrongly make the radio unlawful and unreliable."],
    v: "Trigger a door contact at the far end of the property and confirm the hub reports the event within a second, then replay a recorded frame and confirm the system rejects it or flags the device as insecure.",
    dep: ["radio-coprocessor","protocol-adapters"]
  },
  "ip-mesh-border-router": {
    s: "A router between a low-power IP mesh and the home network, giving mesh devices ordinary IP addresses so any controller can reach them and they can reach the hub.",
    d: "The border router advertises prefixes, forwards packets between the mesh and the home network and provides service discovery and name lookup on behalf of mesh devices. Several border routers in one home improve reliability and range, and they must share the same network credentials and leader information. It is hard because the border router is a single point of failure by default, address handling has to survive reboots, and its configuration and keys must be synchronized among several routers.",
    k: ["Several border routers vs one: several provide redundancy and coverage, but must coordinate credentials and avoid conflicting advertisements.", "Hub as border router vs a separate device: built into the hub means fewer boxes, but a hub reboot takes the mesh's connectivity with it."],
    p: ["Two border routers set up independently create two separate mesh networks that look like one to users.", "A reboot of the only border router drops every mesh device's control path until it returns."],
    v: "Run two border routers, power off one while commanding a mesh device, and confirm the command still succeeds through the other within the failover time.",
    dep: ["low-power-mesh-radio","radio-coprocessor","local-discovery","network-segmentation"]
  },
  "radio-coprocessor": {
    s: "A separate chip running the radio stack, connected to the hub by a serial link, so protocol timing is handled in real time away from the general-purpose operating system.",
    d: "The host sends and receives frames and management commands over a serial protocol with framing, checksums and flow control. The coprocessor handles link-layer timing, acknowledgments, encryption and routing, and reports events upward. Its firmware is updated from the host, and the host resets it when it hangs. It is hard because the interface is a protocol itself, version mismatches between host and chip break communication, and a stuck chip looks like every device going offline.",
    k: ["Coprocessor with stack on it vs radio chip driven by the host: a coprocessor meets timing reliably and isolates faults, but adds a firmware to update and a link to monitor.", "Host-stored network state vs chip-stored: host storage survives chip replacement, but needs synchronization on every change."],
    p: ["A serial link without flow control drops frames during a burst and loses acknowledgments.", "Updating the coprocessor firmware with a host that expects the old interface leaves the hub unable to talk to any device."],
    v: "Kill the coprocessor's firmware mid-run, confirm the supervisor resets it, devices are marked unavailable only briefly and the network state is restored with no devices re-paired.",
    dep: ["process-supervisor","watchdog-recovery"]
  },
  "coexistence-manager": {
    s: "Coordinates the radios that share the 2.4 GHz band, wireless LAN, mesh and short-range links, to reduce interference and prioritize urgent traffic.",
    d: "The manager chooses non-overlapping channels, sets transmit power and, where the hardware supports it, uses signals between radios to arbitrate access to a shared antenna and time slots. It monitors error and retry counters and suggests or applies changes. It is hard because the hub does not control the neighbors' networks, interference varies over the day, and tuning one radio often hurts another.",
    k: ["Static channel plan vs adaptive: static is predictable, but cannot react to new neighbors; adaptive responds, but changes can drop devices.", "Priority to mesh control traffic vs fairness: priority keeps lights responsive, but starves bulk transfers such as updates."],
    p: ["Co-located radios sharing an antenna without arbitration lose packets on both whenever the wireless LAN is busy.", "Frequent automatic channel moves cause battery devices to lose the network repeatedly."],
    v: "Run a large file transfer over wireless LAN next to the hub and measure mesh command success and latency before and after coexistence settings are applied.",
    dep: ["low-power-mesh-radio","wifi-device-link","ble-link"]
  },
  "protocol-adapters": {
    s: "One module per protocol that translates frames and attributes to and from the hub's entities and commands, hiding each protocol's quirks from everything above.",
    d: "An adapter handles discovery, state reporting, command encoding, retries, timeouts and error mapping for its protocol, and publishes entities to the device model. It applies vendor-specific quirks, such as a switch that reports its state in a nonstandard attribute. Adapters run in the integration host with limited rights. It is hard because real devices deviate from specifications, so adapters accumulate special cases, and each adapter's idea of failure, such as timeout, must be translated to a consistent availability signal.",
    k: ["Quirk tables in data vs code: data-driven quirks let community fixes ship quickly, but cannot express complex behavior.", "Adapter isolated in its own process vs in the main process: isolation contains crashes and leaks, but costs memory and message passing overhead."],
    p: ["An adapter that retries failed commands forever floods the radio and delays other devices.", "Unhandled protocol errors that stop the adapter leave all its devices reporting stale state."],
    v: "Pair one device of each supported protocol and confirm each reports state and executes a command through the common model, and kill the adapter process and confirm the others continue and the failed one restarts.",
    dep: ["entity-model","integration-host","availability-tracking","radio-coprocessor"]
  },

  "device-key-store": {
    s: "Protected storage for the hub's long-lived secrets: network keys, certificate authority keys, cloud credentials and device pairing keys, with access limited to the components that need them.",
    d: "Secrets are kept encrypted at rest, ideally with a key held in a hardware secure element or protected storage that does not release it. Components request operations such as sign or decrypt rather than read keys where possible. Backups of the store are separately encrypted. It is hard because small hubs often lack secure hardware, secrets still have to be available at boot with no human typing a passphrase, and the same keys must be recoverable by the owner on a replacement unit.",
    k: ["Hardware-backed keys vs file-based keys: hardware resists extraction from a stolen unit, but cannot be copied to a replacement; files can be backed up, but are exposed if the flash is read.", "Operations on keys inside the store vs handing out keys: operations limit exposure to the store's process, but add an interface that must be fast."],
    p: ["Storing the encrypted keys and the decryption key on the same flash gives no protection against a stolen unit.", "A key export path that is open to any local process undermines all other protection."],
    v: "Image the flash of a powered-off hub and confirm no secret or key material appears in the image, and confirm a component without the right permission is refused a signing request.",
    dep: ["embedded-database"]
  },
  "local-tls-certificates": {
    s: "Certificates and encrypted transport for the hub's local interfaces, so apps and browsers can reach it by name without warnings and without sending credentials in clear.",
    d: "The hub holds a certificate for its local name, either issued from the home's own authority and installed on the owner's devices, or obtained by proving control of a name through a public authority. It renews them automatically and serves interfaces over TLS. Devices and apps pin the hub's identity once paired. It is hard because the hub is inside a private network with no public name by default, certificate warnings teach users to click through, and the clock must be right to validate anything.",
    k: ["Home-authority certificate vs public certificate for a vendor name: a home authority needs no outside service, but needs installation on every device; a public certificate works everywhere, but depends on the vendor's name service.", "Pinning vs relying on the certificate chain: pinning resists a rogue authority, but breaks on hub replacement without a re-pair step."],
    p: ["An expired local certificate makes every app refuse to connect on the morning of expiry.", "Teaching users to accept certificate warnings leaves them open to a real attacker on the network."],
    v: "Advance the test clock close to the certificate expiry and confirm automatic renewal succeeds with no client warnings, and connect with a wrong certificate and confirm the app refuses.",
    dep: ["device-key-store","clock-sync"]
  },
  "network-segmentation": {
    s: "Placing devices on separate network segments, such as one for smart devices and one for computers, with rules that limit which can talk to which.",
    d: "The router or hub creates a segment for connected devices with limited internet access, allowing the hub to reach them and denying them access to personal computers. Rules allow only needed traffic: discovery, the hub's control port and the update server. Multicast has to be relayed deliberately so discovery works across segments. It is hard because strict isolation breaks discovery and casting features, and many homes have routers that do not support segments.",
    k: ["Isolated device segment vs one flat network: isolation contains a compromised bulb, but breaks discovery unless multicast is relayed.", "Default deny for device internet access vs open: deny stops devices phoning home, but blocks update checks and cloud features unless allowed."],
    p: ["Isolation that blocks multicast makes devices vanish from discovery with no explanation.", "A compromised cheap camera on the main network scans and attacks the owner's computers."],
    v: "From a device on the isolated segment, try to reach a computer on the main network and the internet, and confirm only the allowed hub and update destinations answer while discovery from the hub still works.",
    dep: ["local-discovery","wifi-device-link"]
  },
  "token-management": {
    s: "Issuing, scoping, rotating and revoking the tokens that let apps, cloud services and integrations act on the hub without using a person's password.",
    d: "Each token carries an identity, scope, expiry and an identifier for revocation. Short-lived access tokens are refreshed with longer-lived refresh tokens bound to a device. Long-lived tokens for scripts are scoped narrowly and listed to the owner. Tokens are stored hashed on the hub and never logged. It is hard because revoking must take effect everywhere quickly, including in cloud caches, and because token leakage through logs, backups and screenshots is easy to cause.",
    k: ["Short-lived tokens with refresh vs long-lived: short-lived limit theft damage, but need a working refresh path; long-lived are simple, but powerful when stolen.", "Scoped tokens vs full-access tokens: scopes limit what a script can do, but demand that owners choose scopes sensibly."],
    p: ["Tokens written to debug logs are then included in a support bundle sent to others.", "Revocation applied only at the hub leaves a cloud cache honoring a stolen token."],
    v: "Issue a scoped token, use it to read state, confirm a write is refused, revoke it and confirm all paths, local and remote, reject it within the stated time.",
    dep: ["user-accounts","embedded-database"]
  },
  "permission-enforcement": {
    s: "The single checkpoint that decides, for every command and query from any interface, whether the caller's role, scope and the device's sensitivity allow it.",
    d: "Requests from apps, voice, rules, integrations and the cloud proxy all pass through the same check, carrying an identity and context. The policy combines role permissions, area scope, token scope and per-device sensitivity, such as locks needing a stronger session. Denials are logged. Rules run with their owner's rights, not unlimited rights. It is hard because any interface that skips the checkpoint becomes a bypass, and because rules written by one person run later when that person's rights have changed.",
    k: ["Central policy check vs checks in each interface: central enforcement cannot be forgotten by a new interface, but becomes a hot path that must be fast and correct.", "Rules run as their author vs as the system: author rights prevent privilege escalation through rules, but break rules when the author leaves."],
    p: ["A new integration added without passing through the checkpoint exposes locks to anyone with its token.", "Rules running as the system let a child account trigger an adult-only action indirectly through a scene."],
    v: "Exercise a restricted action through app, voice, rule, token and remote path with an unprivileged identity and confirm every path is denied and logged with its origin.",
    dep: ["household-roles","token-management","access-audit-log"]
  },
  "vulnerability-response": {
    s: "The process and tooling for learning of, fixing and delivering fixes for security flaws in the hub and the devices it manages, within a stated timeframe.",
    d: "It includes a reporting channel for researchers, a software bill of materials listing third-party components, monitoring for advisories, a triage process and a patch pipeline that can ship an emergency update to hubs and devices. A support period states how long each product receives fixes. It is hard because homes run old devices for a decade, many makers stop updating, and the hub may be the only component that can compensate by blocking or isolating a vulnerable device.",
    k: ["Hub-side mitigation for unpatched devices vs only advising replacement: mitigation protects users now, but is incomplete and gives false comfort.", "Fixed support period vs open-ended: a stated period sets honest expectations, but ends coverage for devices that still work."],
    p: ["No bill of materials means a library flaw is known to exist but nobody can tell which products contain it.", "An update channel that depends on the cloud cannot reach hubs that are offline when the fix ships."],
    v: "Simulate a flaw in a bundled library and confirm the bill of materials lists every affected product, and a test hub receives the emergency update and reports the fixed version within the target time.",
    dep: ["firmware-inventory","update-manifest-signing"]
  },
  "data-minimization": {
    s: "Collecting, keeping and sharing only the data the home's functions need, with local processing by default and clear settings for anything that leaves.",
    d: "Policy classifies data: state, presence, audio, video and location, and sets for each where it is processed, how long it is retained and who can see it. Cloud uploads are opt-in, minimized and pseudonymized, and telemetry about the hub is separated from content about the home. Deletion reaches backups and caches. It is hard because convenience features, such as remote history or voice improvements, pull toward collecting more, and because patterns in innocuous data reveal when people are home or away.",
    k: ["Local processing by default vs cloud processing: local keeps data in the home, but limits features that need heavy computation.", "Aggregate telemetry vs per-home detail: aggregates support product quality without exposing households, but make finding a specific fault harder."],
    p: ["Diagnostics bundles that include room names and event times reveal household routines to support staff.", "Retention that defaults to forever stores years of movement data nobody asked for."],
    v: "Inspect network traffic from a hub for a day with cloud features off and confirm it contacts only the update and time services, with a payload review showing no household data.",
    dep: ["history-recorder","structured-logging"]
  },

  "process-supervisor": {
    s: "Starts the hub's services in dependency order, restarts the ones that fail with backoff, limits their resources and reports their health.",
    d: "Each service runs as a separate process with its own user, filesystem view and memory and CPU limits, declared in a manifest with dependencies and health checks. The supervisor restarts a crashed service, gives up after repeated failures and reports status to the indicators and the web interface. Shutdown is orderly so the database closes cleanly. It is hard because restart loops can hide a real fault, ordering must tolerate slow radios, and a supervisor that crashes takes everything with it.",
    k: ["Many isolated processes vs one process with threads: isolation contains faults and enforces limits, but costs memory and requires message passing; one process is lean, but one bug takes it all down.", "Restart forever vs give up after limit: endless restarts maximize uptime, but burn flash and hide a persistent failure."],
    p: ["A service that crashes at startup and restarts every second fills the log and wears the flash.", "Starting services without waiting for the radio coprocessor makes the first minute's commands fail."],
    v: "Kill the automation service ten times in a minute and confirm the supervisor backs off, other services continue unaffected, and the status page reports the repeated failures.",
    dep: ["watchdog-recovery","structured-logging"]
  },
  "embedded-database": {
    s: "A small local database holding configuration, registry, accounts, rules and history, designed to survive power loss and run on little memory.",
    d: "The database is a single-file transactional store with write-ahead logging so a power cut leaves either the old or the new state. Configuration and history may live in separate files with different durability settings. Schema migrations run at upgrade with a backup first. It is hard because home hubs lose power without warning, flash has limited write cycles, a corrupt file means the home loses its identity, and migrations must work from any older version.",
    k: ["Synchronous commits vs delayed flush: synchronous commits survive power loss, but slow writes and wear flash; delayed flush is fast, but may lose the last seconds.", "One database file vs separate ones for history and configuration: separation lets history be reset or pruned without risking configuration, but needs coordination for backup."],
    p: ["A schema migration that fails halfway leaves a hub that will not start with no way back.", "A write-ahead log on a nearly full disk stops committing and the hub silently loses changes."],
    v: "Cut power repeatedly during writes in a test rig for a thousand cycles and confirm the database opens each time with consistent data, and run the migration from the oldest supported version successfully.",
    dep: ["storage-wear-management"]
  },
  "clock-sync": {
    s: "Keeps the hub's time correct using network time and a battery-backed clock, because schedules, certificates, logs and sunrise calculations all depend on it.",
    d: "The hub synchronizes against network time servers, with a hardware clock holding time across power loss. If the network is down at boot, it uses the hardware clock and marks time as unsynchronized so that certificate checks and schedules can adjust their behavior. Time zone and daylight saving data are updated with the system. It is hard because many failures start with a wrong clock: certificates look expired, schedules fire at the wrong time, and logs cannot be correlated.",
    k: ["Hardware clock with battery vs time from network only: a battery clock keeps time through outages, but adds a part that fails; network-only has no battery, but starts at an unknown time.", "Step the clock vs slew it: stepping corrects fast, but makes events jump; slewing is smooth, but takes long for large errors."],
    p: ["Booting with a clock set decades back makes every certificate appear invalid and blocks cloud and local TLS.", "Time stepping backward during a run causes schedulers to refire events."],
    v: "Boot a hub with the network disabled and the clock wrong, confirm it flags time as unsynchronized and delays time-dependent rules, then enable the network and confirm correction and normal operation.",
    dep: []
  },
  "integration-host": {
    s: "The environment that loads and runs integrations and adapters, giving each a defined interface, limited permissions and its own failure boundary.",
    d: "Integrations are packages that implement an interface for discovery, setup, entities and updates. The host loads them, passes configuration, provides services such as networking and storage, and enforces limits on memory, time per call and what files and keys they can read. Community integrations can be installed with a visible trust level. It is hard because third-party code runs on a device that controls doors, so isolation, compatibility across versions and the cost of a misbehaving integration must be controlled.",
    k: ["Sandboxed integrations vs trusted in-process: sandboxing contains bugs and malice, but limits what integrations can do and costs resources.", "Stable versioned interface vs rapid change: stability keeps integrations working for years, but slows hub improvements."],
    p: ["An integration that blocks its event loop freezes the whole hub when running in-process.", "A community integration with broad file access reads the key store."],
    v: "Install a test integration that allocates memory without limit and one that tries to read the key store, and confirm the first is killed at its limit and the second is denied, with the rest of the hub unaffected.",
    dep: ["process-supervisor","permission-enforcement","entity-model"]
  },
  "structured-logging": {
    s: "Leveled, machine-readable logs from every component, with identifiers that link a request across services, bounded storage and redaction of secrets and personal data.",
    d: "Each component writes events with level, component, context identifier and structured fields to a log service that rotates files and caps total size. Levels can be raised for a limited time to debug. Support bundles collect logs, versions and status, with redaction applied before they leave the hub. It is hard because logs on flash must not wear it out, they will contain sensitive information unless deliberately cleaned, and the useful event is often the one that was dropped to save space.",
    k: ["Verbose logs in memory with a small persistent log vs everything on flash: memory logs save wear and are rich at the moment of failure, but vanish on power loss; persistent logs survive, but cost flash.", "Redaction at write time vs at export: write-time redaction is safe by default, but loses detail developers need; export-time keeps both and risks exposure."],
    p: ["Debug logging left enabled fills storage and fills the flash write budget in weeks.", "Logs containing door codes and tokens are attached to a support request."],
    v: "Enable debug level for ten minutes while exercising unlock, token and voice flows, export a support bundle and search it for the test secrets and names, confirming none appear, and confirm debug reverts automatically.",
    dep: ["storage-wear-management","clock-sync"]
  },
  "storage-wear-management": {
    s: "Limits and spreads writes to flash storage, with write budgets per component, batching, wear monitoring and a plan for when the storage degrades.",
    d: "Flash memory survives a finite number of writes, and a hub writing history, logs and state every second can exhaust a consumer card in under a year. The platform assigns write budgets, batches and compresses writes, keeps volatile data in memory, and uses a filesystem designed for flash. It reads the device's wear indicators and warns the owner before failure. It is hard because every component wants to persist data, and wear is invisible until the device fails, usually with a corrupt database.",
    k: ["Industrial grade storage vs consumer card: industrial storage lasts years under writes, but costs more; consumer cards are cheap and fail sooner.", "Memory cache with periodic flush vs immediate writes: caching saves wear, but loses the last interval at power loss."],
    p: ["A cheap card written continuously fails after months and takes the home's configuration with it.", "No wear monitoring means the first warning is a hub that no longer boots."],
    v: "Run the hub under a representative week of load and read the storage wear counters and write volume per component, confirming the projected life exceeds the stated target with each component within its budget.",
    dep: []
  },
  "watchdog-recovery": {
    s: "Hardware and software timers that detect a hung hub and restart it, with layered recovery from restarting one service up to rebooting and booting a known good image.",
    d: "Services send heartbeats to the supervisor, which feeds a hardware watchdog; if the supervisor stops, the watchdog resets the board. After repeated failed boots, a bootloader switches to a previous system image or a recovery mode. Reasons for reboots are recorded and shown. It is hard because recovery has to be strong enough to fix real hangs but not so aggressive that it reboots a healthy hub, and boot loops must not hide the original fault.",
    k: ["Layered recovery from service restart to reboot vs reboot at the first sign of trouble: layers keep most of the home running, but add logic; quick reboot is simple, but interrupts everything.", "Dual system images vs a single image: two images let a bad update roll back, but need extra storage."],
    p: ["A watchdog fed by a thread that is still alive while the real work is hung never fires.", "Reboot loops after a bad update leave the home without any control until someone intervenes."],
    v: "Freeze the main process, confirm the layered steps run in order and the hub recovers within the target time, and then corrupt the new system image and confirm it boots the previous one and records why.",
    dep: ["process-supervisor"]
  },

  "local-first": {
    s: "The decision that the home works without the internet, and that the cloud adds features rather than provides the core ones.",
    d: "Control, rules, schedules, local voice and security must run on hardware inside the house, with all state held locally and the cloud used for remote access, backups and optional integrations. Every feature is assigned a dependency class: local, local with cloud enhancement, or cloud only. It shapes protocol choices, storage, identity and update design. The cost is that the hub needs enough compute and storage to do everything itself, and that vendor business models built on subscriptions lose their natural lock-in.",
    k: ["Local authority with cloud sync vs cloud authority with local cache: local authority survives outages and vendor failure, but must solve identity and recovery itself.", "Local voice processing vs cloud only: local keeps working and private, but needs more hardware and has lower accuracy."],
    p: ["A feature quietly depending on a cloud call, such as a lock requiring cloud authorization, fails during an outage.", "Local features that need the cloud at first setup cannot be recovered after the vendor shuts down its service."],
    v: "Cut the internet and run a checklist of core scenarios, including a morning routine, a door unlock and a leak alert, and confirm each completes, with a list of features that degrade and their documented reason.",
    dep: []
  },
  "trust-model": {
    s: "The explicit statement of who and what is trusted in the home, from residents and guests to devices, neighbors and the vendor's cloud, and what each can do if compromised.",
    d: "The model names the assets, such as doors, cameras, alarms, personal data and network access, and the threats: a stolen phone, a malicious device, a neighbor within radio range, a compromised cloud account and an abusive household member. It decides where to authenticate, what to isolate and what to log. It shapes commissioning, permissions and segmentation. It is hard because homes have unusual trust: family members are trusted but not equally, abuse by someone with legitimate access is real, and devices are bought from unvetted makers.",
    k: ["Treating every device as untrusted vs trusting certified ones: untrusted by default limits damage from a bad device, but needs segmentation and constrained permissions.", "Owner has total control vs protective limits for coercive situations: total control is simple, but gives an abuser access to history and locks; limits protect, but complicate ownership."],
    p: ["A model that ignores the person with legitimate access leaves someone being tracked by an ex-partner who still has admin rights.", "Assuming the home network is a safe zone lets any compromised device attack the hub."],
    v: "Walk each documented threat, such as a stolen phone or a rogue device, through a test, and confirm the documented containment holds and what an attacker can reach matches what the model states.",
    dep: []
  },
  "interoperability": {
    s: "The decision about which open standards and ecosystems to support, which to bridge and which to skip, and how to keep devices from different makers working together.",
    d: "Supporting a common application layer lets devices from different makers share one data model and commissioning flow, while bridges bring in older protocols. Each added protocol multiplies testing, certification and support. The decision determines the entity model, the adapters and what features are lowest common denominator. The cost is that standards lag manufacturers' features, certified devices still behave differently, and bridges add latency and a single point of failure.",
    k: ["Supporting one common standard well vs many protocols shallowly: one standard gives depth and testability, but excludes legacy devices; many protocols cover more, but spread effort thin.", "Strict conformance vs tolerating quirks: strictness keeps the core clean, but real devices need exceptions to work at all."],
    p: ["Claiming support for a standard while implementing only part of it causes certified devices to fail in confusing ways.", "Depending on a vendor's private interface breaks every time the vendor changes it."],
    v: "Pair a matrix of devices from several makers per protocol and confirm each completes commissioning and a basic command, and publish the pass or fail table with the device versions used.",
    dep: []
  },
  "latency-budget": {
    s: "The decision about how quickly each interaction must complete and how reliable it must be, such as a light answering a switch in under about 200 milliseconds, with budgets split across layers.",
    d: "People notice delays above a few hundred milliseconds, so the budget for a button to light includes radio hops, hub processing, rules and adapter time. Reliability targets differ by function: a missed temperature report is minor, a missed smoke alarm is not. Budgets drive priority queues, local execution, retry policy and where cloud can be used. The cost is that hitting the budget limits design choices, such as a cloud round trip for something that must feel instant.",
    k: ["Direct device-to-device binding vs routing through the hub: direct binding is fastest and works when the hub is down, but cannot be changed by hub logic.", "Strict priority for safety traffic vs fair sharing: priority guarantees alarms get through, but can starve other traffic in a storm."],
    p: ["Adding one more hop for a convenience feature pushes a wall switch past the point where users perceive lag.", "Averages hide the long tail, so the light that sometimes takes four seconds gets no attention."],
    v: "Measure the ninety-ninth percentile latency from switch press to light on over a thousand presses under normal and busy load, and compare it against the stated budget for each layer.",
    dep: []
  },
  "failure-isolation": {
    s: "The decision to contain faults so that one failing device, integration or service does not take down the home.",
    d: "It means separate processes with resource limits, bounded queues, timeouts on every call, circuit breakers for slow dependencies and a safe default state for physical actions when control is lost. A rule engine crash must not stop lights working from switches, and a bad integration must not freeze the event bus. Critical functions such as alarms and heating protection run in the smallest, most reliable parts. The cost is more processes, messages and states to test.",
    k: ["Process isolation vs shared memory speed: isolation limits blast radius, but costs memory and copying; shared memory is fast, but couples failures.", "Fail safe vs fail operational for physical devices: fail safe, such as heaters off, avoids hazard, but can mean losing comfort; fail operational keeps running with risk."],
    p: ["A single blocking call without a timeout lets one slow cloud service freeze automation for every device.", "Devices left in the last commanded state after a hub crash, such as a heater on, are a safety hazard."],
    v: "Inject failures one at a time: an integration crash, a stuck coprocessor, a full disk and a slow cloud, and confirm in each case the unaffected functions, such as switch control, continue and the failed part is reported.",
    dep: []
  },
  "backward-compatibility": {
    s: "The decision to keep old devices, rules, apps and backups working across hub and protocol upgrades for the many years a home keeps them.",
    d: "Interfaces, rule formats and device data are versioned with documented migration paths, and old versions are supported for a stated period. The hub stays compatible with devices that will never update by keeping legacy modes, and apps work with an older hub. Deprecations are announced and tested on real backups. The cost is carrying old code and special cases forever, which slows development and enlarges the attack surface, against the cost of breaking a house that someone depends on.",
    k: ["Long support windows vs forcing upgrades: long windows protect users, but accumulate legacy code; forcing upgrades keeps the code clean, but strands working homes.", "Migrating data on upgrade vs interpreting old formats at runtime: migration keeps one format, but is risky if it fails; runtime interpretation is safe, but permanent."],
    p: ["A rule format change without migration silently changes what thousands of automations do.", "Dropping support for an old radio mode strands every device that cannot be updated."],
    v: "Take backups and rule files from the oldest supported versions, upgrade to the current release, and confirm every rule runs with the same behavior and every device still responds, with migration logs and a successful rollback.",
    dep: []
  },
});
