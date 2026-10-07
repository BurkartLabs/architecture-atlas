// Details for the in-vehicle navigation plate, part 5: offline maps and updates, embedded platform, cross-cutting concerns.
ATLAS.details("vehicle-navigation", {
  "region-manager": {
    s: "Tracks which map regions are installed, their versions and sizes, and lets the driver or the system choose which to keep, download or remove.",
    d: "Maps are divided into regions such as countries or states, each a set of tiles with a version. The manager keeps a catalog of installed and available regions, with sizes and dates, and records which are needed for the current trip. It can suggest regions along a planned route and the home area. Installation is atomic: a region is usable only when complete and verified. It is hard because regions interlock at their borders and a route crossing a border needs both sides at compatible versions.",
    k: ["Whole-country regions vs smaller areas: countries are simple and large; smaller areas save storage and require stitching and more border cases.", "Automatic install by trip vs manual selection: automatic avoids missing maps and uses data and storage unasked; manual is controlled and forgotten."],
    p: ["A route across a border fails because the neighboring region is missing or at an incompatible version.", "A partially installed region is used because completeness is not checked."],
    v: "Install a region interrupted midway and confirm it is not offered to routing until complete and verified. Plan a cross-border route with mismatched versions and confirm a clear error or an automatic fetch.",
    dep: ["storage-budget-and-eviction","update-integrity-check","map-software-compatibility"]
  },
  "delta-update-packages": {
    s: "Update files that contain only what changed between map versions, so that a new release is hundreds of megabytes, not tens of gigabytes, and can be applied while keeping the old map usable.",
    d: "At build time the old and new compiled tiles are compared and a patch is produced per changed tile, with a new directory. On the unit, the updater applies patches to a working copy, verifies results against checksums and switches the directory in one atomic step. Only tiles that changed are touched, but identifier stability determines how many do. It is hard because a patch is valid only against one exact base version, so units on different versions need different patches or a full download.",
    k: ["Delta from the previous version only vs from many versions: one base is small and forces stepwise updates; many bases are flexible and multiply build and hosting.", "Binary patching vs tile replacement: patches are smaller and need exact base content; replacing whole tiles is larger and more robust."],
    p: ["Applying a patch to a base that was slightly different, corrupting tiles that still pass size checks.", "A power loss during application leaves a mix of old and new tiles."],
    v: "Apply a delta to an installed region, interrupt power at random points in repeated trials, and confirm the unit either keeps the old map intact or completes the new one, and that checksums match the release.",
    dep: ["compiled-map-format","map-compiler-pipeline","update-integrity-check"]
  },
  "update-delivery-channel": {
    s: "Moves update packages to the vehicle by cellular download, wireless network, a dealer tool or a storage device, with resumable transfers and scheduling that respects cost and power.",
    d: "A server publishes manifests of available updates for a vehicle's region and software version. The client checks periodically, downloads in chunks that can resume, and schedules large transfers for a home network, a parked vehicle or an off-peak time. It reports status and failures back. Dealers and owners can use storage media where connectivity is poor. It is hard because downloads are large and interrupted constantly, and because the vehicle may be off, in a poor coverage area or on a metered plan.",
    k: ["Download while parked vs while driving: parked avoids interrupting the system and delays the update; while driving is available anytime and competes with other uses.", "Push from the server vs client polling: push is timely and needs a persistent channel; polling is simple and slower."],
    p: ["A resumed download assembling chunks from two different release versions.", "Downloads draining the battery of a parked vehicle."],
    v: "Download an update over a deliberately unreliable link with repeated interruptions and confirm it completes with the right checksum, uses no more than the allowed data, and does not drain the battery below a set level.",
    dep: ["connectivity-manager","power-state-handling","update-integrity-check"]
  },
  "update-integrity-check": {
    s: "Verifies that a map or software package is complete, unaltered and from the right publisher before it is installed, by checking signatures and checksums.",
    d: "Packages have a signed manifest listing every file with its hash. The unit verifies the signature against a stored public key, then each file's hash during and after download, and rejects anything that does not match. Rollback protection refuses an older version than the installed one unless explicitly allowed. Keys are in secure storage. It is hard because verification must occur before data is used, not just at download, and because key rotation must work over many years.",
    k: ["Verifying once at install vs also at load: install-time is cheap and misses later corruption; load-time checks catch storage faults and cost time.", "Single signing key vs a chain with rotation: a single key is simple and a disaster if it leaks; a chain is recoverable and more complex."],
    p: ["Signature checked on the manifest but the files are not hashed, so a swapped tile passes.", "An expired certificate stops all updates until the next service visit."],
    v: "Tamper with one byte in a package and with the signature in separate trials, and confirm each is rejected before anything is installed. Attempt to install an older version and confirm it is refused.",
    dep: ["secure-storage-and-keys"]
  },
  "live-map-overlay": {
    s: "A small, frequently refreshed layer of changes on top of the installed map, such as closures, new roads, speed limit changes and hazards, delivered between full map updates.",
    d: "The overlay is a compact list of edits keyed by edge identifier or by location, with a validity period and a base map version. Routing and display apply it on top of tiles: closing edges, adding a temporary road or changing an attribute. It is retired when the permanent map update includes the change. It is hard because edits must be applied consistently by routing, matching and rendering, and because an overlay that targets a different base version affects the wrong roads.",
    k: ["Edge-keyed edits vs geometry-based edits: edge-keyed are exact for the right base and break across versions; geometry-based survive version changes and need matching.", "Applying edits in memory vs rewriting tiles: in memory is fast to apply and remove; rewriting is consistent for all consumers and is costly."],
    p: ["An overlay issued for base version N applied to version N+1, closing an unrelated road.", "Expired edits not removed and left active in the routing graph."],
    v: "Apply an overlay that closes a road and adds a temporary one, and confirm routing, matching and the display all agree. Update the base map and confirm the overlay is retired or re-keyed correctly.",
    dep: ["road-network-model","map-software-compatibility","update-delivery-channel","routing-graph"]
  },
  "storage-budget-and-eviction": {
    s: "Allocates the limited storage between maps, caches, assets and user data, and decides what to remove when space runs out.",
    d: "Flash storage in a head unit is fixed, shared with media, apps and logs, and wears out with writes. The component defines quotas for installed regions, update staging and caches, and chooses what to evict by use, distance from home and route likelihood. Updates need space for both the old and new tiles until the switch, so staging space matters. It is hard because eviction must never remove data that a trip in progress needs and because write volume affects flash life.",
    k: ["Fixed quotas vs shared pool: quotas are predictable and waste space; a shared pool is efficient and lets one consumer starve another.", "Evicting by least recent use vs by importance: recent use is simple; importance, such as home region, protects data a driver needs soon."],
    p: ["Not reserving staging space, so an update fails halfway and leaves the region unusable.", "Constant cache writes wear out flash in a few years."],
    v: "Fill storage to its limit, start an update and a trip simultaneously and confirm the active trip's data is never evicted, the update fails cleanly or completes, and write volume per day stays within the flash endurance budget.",
    dep: ["map-storage-and-io","region-manager"]
  },
  "map-software-compatibility": {
    s: "Ensures that the installed navigation software and the installed map data are a supported pair, rejecting or adapting when a map was built for a different software version.",
    d: "The map header declares a format version and a feature set; the software declares which it understands. At load time the compatibility check accepts, rejects or restricts features, for instance lane data not used if unsupported. Software updates and map updates are sequenced so that each step leaves a valid pair. It is hard because vehicles live for ten to fifteen years, so the matrix of software and map versions is large, and every mismatch becomes a field failure.",
    k: ["Backward-compatible map formats vs strict pairing: compatible formats let old units use new maps and constrain format evolution; strict pairing is simple and strands old units.", "Feature flags per map vs per software: per map lets content opt in; per software keeps behavior uniform and delays features."],
    p: ["A software update released before map updates exist for its format leaves the unit without usable maps.", "A map for a newer format loads and quietly ignores layers, giving worse guidance with no message."],
    v: "Test every supported software version against every supported map format and confirm each pair is accepted or rejected with a clear message, and that features reduce gracefully when layers are not understood.",
    dep: ["compiled-map-format","update-integrity-check"]
  },
  "location-service-api": {
    s: "The interface through which the navigation application and other vehicle software obtain position, heading, speed and accuracy, and through which they declare how often and how precisely they need it.",
    d: "Clients subscribe to location updates with a rate and an accuracy requirement. The service multiplexes one fused position to many consumers, applies permission checks and sends updates to cluster and driver-assistance functions that may need a different format or rate. It also lets other software supply position, for example from a phone. It is hard because consumers range from a display to a safety function, each with different latency and integrity needs, and because many vendors implement both sides.",
    k: ["One shared fused position vs per-client filtering: shared is consistent and cheap; per-client allows specialized behavior and diverges.", "Push updates vs request-response: push is timely for continuous consumers; request-response is simple for occasional ones."],
    p: ["A consumer assuming position is always available crashes or mis-behaves when the service reports no fix.", "Different consumers receiving positions with different time bases and disagreeing."],
    v: "Subscribe three clients with different rates and confirm each receives updates at its rate with consistent timestamps. Remove the satellite signal and confirm every client gets an explicit degraded or no-fix status.",
    dep: ["matched-position-output","position-confidence-output","consent-and-data-controls"]
  },
  "vehicle-signal-gateway": {
    s: "Reads the vehicle network signals navigation needs, speed, wheel pulses, yaw, gear, ignition, lights and units, and presents them as named, typed values, hiding differences between vehicle models.",
    d: "Signals travel in messages on the vehicle's network with defined ids, scaling and cycle times, which differ between models and years. The gateway maps raw messages through a signal catalog to named values with units and validity flags. It also sends outputs, such as guidance data to the cluster. It is hard because the same logical signal is encoded differently across platforms, because data may be absent or invalid, and because this layer is a security boundary to safety-critical networks.",
    k: ["Per-vehicle signal catalogs vs a standard signal model: per-vehicle is exact and multiplies configuration; a standard model is portable and needs adaptation by the vehicle maker.", "Read-only vs bidirectional access: read-only is safer; bidirectional enables cluster output and widens exposure."],
    p: ["Treating a signal with an invalid flag set as a valid zero speed.", "A catalog from one model year applied to another with different scaling gives wrong speed."],
    v: "Replay a recorded vehicle network log through the gateway and compare produced values and validity flags with an independent decode. Confirm that no write path exists to networks beyond the allowed outputs.",
    dep: ["process-supervision"]
  },
  "process-supervision": {
    s: "Starts the navigation processes in the right order, monitors them with watchdogs and restarts them after failure, so that a crash in one part does not take down guidance.",
    d: "The supervisor launches components, such as positioning, routing, rendering and audio, as separate processes with limited memory and processor shares. Each reports health periodically; a missing heartbeat triggers restart, with state recovered from persistent storage. Priority settings keep positioning and audio responsive when rendering is busy. It is hard because restarts must be quick enough to resume mid-trip and because a crash loop must not drain the battery or hide in logs.",
    k: ["Separate processes vs one process with threads: separate isolates faults and costs inter-process messaging; one process is fast and a fault takes down all.", "Restart immediately vs back off: immediate recovers quickly from a transient fault; back off prevents a crash loop."],
    p: ["A crash loop in the renderer restarting every few seconds and starving other components.", "A watchdog timeout set shorter than a legitimate long operation such as loading a large tile."],
    v: "Kill each component in turn during a trip and measure the time to resume guidance and whether the trip state is preserved. Inject a component that fails repeatedly and confirm back-off and an error report.",
    dep: ["trip-state-persistence","diagnostics-and-logging"]
  },
  "startup-and-resume": {
    s: "Brings navigation to a usable state within seconds of ignition, restoring position, trip and map state, so that guidance is ready before the driver pulls away.",
    d: "Start-up opens the map header, restores the last position and the active trip, and starts the receiver with stored almanac and time data for a fast fix. The first screen appears quickly with a rough position, and heavier loads continue in the background. Cold starts after a long break require a longer search for satellites. It is hard because the vehicle's other systems have their own boot order, and because a driver expects the map within a few seconds while the satellite fix may take a minute.",
    k: ["Show a stale position immediately vs wait for a fix: stale is instant and can mislead; waiting is honest and looks broken.", "Eager loading of everything vs lazy: eager is smooth afterward and slow to start; lazy starts fast and hitches later."],
    p: ["A last position shown as current after the vehicle was moved on a ferry or a trailer.", "Start-up blocked on a network call when there is no connection."],
    v: "Time the interval from ignition to the first usable map screen and to the first valid fix in cold, warm and hot starts on target hardware, and compare with the specified limits.",
    dep: ["map-storage-and-io","trip-state-persistence","gnss-receiver-interface"]
  },
  "map-storage-and-io": {
    s: "Reads map files from flash or disk with predictable latency, using memory mapping, read-ahead and integrity checks, and keeps writes small and safe.",
    d: "Compiled maps are large, read-mostly files. The storage layer maps them into memory, schedules reads with priorities, so that rendering and matching beat prefetch, and verifies checksums when loading. Writes for caches, trips and settings go through a journaled store that survives power loss. Flash has erase blocks and wear limits, so writes are batched. It is hard because read latency spikes under contention and the vehicle may lose power at any moment.",
    k: ["Memory-mapped reads vs explicit buffered reads: mapping is simple and lets the operating system decide residency; explicit reads give control over latency and need more code.", "Checking checksums on every load vs on install: every load catches flash faults and costs time; on install is cheap and trusts storage."],
    p: ["A read blocked behind a large prefetch causing a visible stall.", "A write interrupted by power loss corrupting the settings or trip file."],
    v: "Measure read latency percentiles under concurrent prefetch and rendering load. Cut power repeatedly during writes and confirm the store recovers to a consistent state at every restart.",
    dep: ["secure-storage-and-keys"]
  },
  "connectivity-manager": {
    s: "Manages the data connections navigation uses, cellular, wireless networks and the paired phone, choosing among them by cost, availability and the type of traffic.",
    d: "The manager tracks which links exist and their quality, then assigns requests: traffic and search over cellular, large map downloads over a wireless network. It queues requests when no link is available, applies data limits and roaming rules, and notifies components about changes. It is hard because connectivity changes constantly while driving, because costs differ between links and countries, and because every service needs a graceful result when there is none.",
    k: ["Own connection vs the vehicle's shared connectivity service: own gives control and duplicates cost and certification; shared is consistent and subject to others' policy.", "Queuing requests offline vs failing them: queuing eventually delivers and can send stale requests; failing is simple and loses work."],
    p: ["Large downloads sent over a roaming link without warning, leading to a bill.", "Requests retried in a tight loop after a link drops."],
    v: "Move between full coverage, poor coverage and none, and a roaming network, and confirm each service falls back as specified, no large transfer uses a restricted link and queued requests are sent or dropped according to their rules.",
    dep: ["consent-and-data-controls","process-supervision"]
  },
  "power-state-handling": {
    s: "Reacts to ignition, accessory and sleep states and low-battery conditions: saving state at shutdown, keeping the receiver warm if appropriate and staying within a strict budget while the vehicle is off.",
    d: "The vehicle announces power transitions on the network. On shutdown navigation has a short window to save the trip, calibration and caches, then stops writes and powers down. In some modes it keeps the receiver or a low-power processor alive for fast restart or to run updates. Standby current is budgeted in milliamps. It is hard because the window can be a second or less, and because background activity such as downloads can drain the battery.",
    k: ["Keeping the receiver warm vs cold start: warm gives a fast fix and a standby drain; cold is free and slow after a long park.", "Saving state continuously vs at shutdown: continuous survives abrupt power loss and increases writes; at shutdown is light and loses data on a crash."],
    p: ["Shutdown save not finished before power is cut, corrupting the trip file.", "Background update activity keeping the unit awake and flattening the battery over a weekend."],
    v: "Cycle ignition in all supported sequences with a trip active and confirm the trip and calibration persist. Measure standby current over a long park against the budget.",
    dep: ["trip-state-persistence","vehicle-signal-gateway","map-storage-and-io"]
  },
  "diagnostics-and-logging": {
    s: "Records faults, performance counters and selected events, and exposes them to service tools and, with consent, to the manufacturer, to find and fix field problems.",
    d: "Components write structured log entries to a bounded ring buffer in flash and raise diagnostic trouble codes for conditions such as receiver not responding or map corrupt. Service tools read them over the vehicle diagnostic connection. Field logs can be uploaded for analysis, with position data reduced or removed. It is hard because failures depend on location and map version and are hard to reproduce, because logs must be bounded in size, and because logs may contain personal data.",
    k: ["Verbose logging always vs on trigger: always has the evidence and fills storage and exposes data; on trigger is light and misses the first occurrence.", "Logging raw traces vs summaries: raw reproduces problems and carries privacy risk; summaries are safer and less helpful."],
    p: ["Logs holding precise trips sent for analysis without the driver knowing.", "A full log partition causing writes to fail and the application to hang."],
    v: "Induce a receiver failure and a corrupt tile and confirm the matching trouble codes and log entries appear and can be read by a service tool. Confirm the log stays under its size limit and contains no persistent location trace.",
    dep: ["map-storage-and-io","consent-and-data-controls"]
  },
  "consent-and-data-controls": {
    s: "Holds the driver's choices about what location and trip data may be used or shared, enforces them across services, and lets the driver view and erase their data.",
    d: "Consent records are stored per driver and per purpose, such as traffic reporting, personalized suggestions and diagnostics upload. Every component that sends or stores location data checks the record before acting. The driver can withdraw consent, export or delete data. Region rules, such as those on data subject rights, shape defaults. It is hard because data flows are scattered across components, because consent must follow ownership changes of the vehicle, and because enforcement must be provable.",
    k: ["Central consent check vs checks in each component: central is consistent and a single point of failure; per component is flexible and easy to miss.", "Default off vs default on with opt-out: off is the stronger privacy stance and reduces traffic data; on has better data and weaker legitimacy."],
    p: ["A new feature uploading data without checking the consent record because it was added after the checks.", "Withdrawal applied to the interface but not to queued uploads."],
    v: "Withdraw each consent in turn and capture network and storage activity to confirm the corresponding data flow stops, including queued items. Perform a delete request and confirm stored data is gone.",
    dep: ["secure-storage-and-keys"]
  },
  "secure-storage-and-keys": {
    s: "Protects stored secrets and personal data, with encrypted storage, keys held in secure hardware and a clean wipe when the vehicle changes owner.",
    d: "Account tokens, favorites, trip history and signing keys live in an encrypted area. Keys sit in a secure element or protected key store, tied to the device, and are never exposed to application code. Authentication of update packages and cloud services uses them. A factory or owner reset destroys the keys so data becomes unreadable. It is hard because the unit must survive power loss during key operations, because keys must be rotated over a long life, and because attackers have physical access.",
    k: ["Hardware-backed keys vs software keys: hardware resists extraction and adds cost and a dependence on a supplier; software is cheap and exposed to a physical attacker.", "Encrypting everything vs only sensitive items: everything is simple to reason about and costs performance; selective is fast and leaves gaps."],
    p: ["Reset that removes the database but leaves keys and caches that still reveal trips.", "Keys shared across all units, so one extraction compromises the fleet."],
    v: "Extract the storage chip from a test unit and confirm that personal data is unreadable without the device key. Run an owner reset and confirm no trip or place data is recoverable.",
    dep: []
  },
  "driver-distraction-and-safety": {
    s: "A set of rules and design limits on how long and how often the system may demand the driver's eyes and hands, applying to every screen, prompt and alert.",
    d: "Guidelines and regulations limit glance time, number of steps for a task and what may be done while moving. They affect screen layouts, text entry lockouts, voice dialog length, prompt timing and the amount of information shown. Testing uses eye-tracking in simulators or on road. The concern also covers incorrect information, since a wrong instruction at speed is a safety event. It is hard because tasks that seem simple, such as picking a destination, are long and every added feature adds demand.",
    k: ["Locking features while moving vs allowing with limits: locking is simplest to certify and drives passengers and drivers to phones; limits keep features and risk misuse.", "Voice-first interaction vs touch-first: voice keeps eyes forward and fails in noise; touch is reliable and visual."],
    p: ["A new screen designed without a glance-time test that takes several seconds to read at speed.", "Lockouts that are easy to bypass and hurt the legitimate use by passengers."],
    v: "Run drivers in a simulator or on closed roads through standard tasks and measure glance durations and total eyes-off-road time against the guideline limits. Review prompts against allowed length.",
    dep: ["touch-and-knob-input","prompt-scheduler","lane-guidance-display"]
  },
  "uncertainty-propagation": {
    s: "The practice of carrying an honest error estimate from sensors through matching, routing and display, so that each stage acts differently when it knows less.",
    d: "Position has an error, the match has a probability, the map has an age and traffic data has a confidence. Components should pass these along: matching widens its search with larger position error, off-route detection waits longer, lane guidance goes silent, and the display shows a degraded marker. Consistent definitions of confidence are needed across suppliers. It is hard because many components were designed assuming exact inputs, and because honest uncertainty can make the system look worse than one that hides it.",
    k: ["Explicit confidence fields vs implicit thresholds: explicit lets each consumer decide and needs consistent definitions; implicit is simple and hides assumptions.", "Showing degraded state to the driver vs hiding it: showing is honest and may alarm; hiding looks polished and is wrong more often."],
    p: ["Components that drop the confidence field and treat all inputs as exact.", "Confidence numbers that are not calibrated, so that a stated 95 percent holds only 70 percent of the time."],
    v: "Compare stated confidence with measured error over many drives, in open sky and in canyons. Confirm downstream behavior changes when confidence drops, such as lane advice disappearing in a tunnel.",
    dep: ["position-confidence-output","matched-position-output","off-route-detection"]
  },
  "offline-first-operation": {
    s: "The design principle that core navigation, search, routing and guidance, must work with no connection, and that online services only add to a complete local system.",
    d: "Connectivity is absent in tunnels, remote areas and abroad, and it is costly or slow elsewhere. So maps, address data, routing and voice are installed locally, and online features such as live traffic and search extend them. Every online call has a timeout and a local fallback, and the interface shows what is stale. It is hard because it forces large local data, because offline and online results can disagree, and because testing each degradation mode multiplies the work.",
    k: ["Local data complete enough to route anywhere vs online-dependent features: local always works and takes storage and updates; online is lean and fails outside coverage.", "Merging online and offline results vs separating them: merging gives one list and complicates freshness; separate is clear and burdens the driver."],
    p: ["A feature that quietly requires a connection, found only when the vehicle is in a tunnel.", "Offline data so old that it routes through closed roads with nothing to say so."],
    v: "Run the full set of core scenarios with all connectivity disabled: search, route, reroute, voice, display. Confirm every scenario completes and the interface shows the age of the map and absence of traffic.",
    dep: ["region-manager","connectivity-manager","poi-index","routing-graph"]
  },
  "map-and-software-versioning": {
    s: "The discipline of keeping identifiers, formats, caches and stored user data valid across many map releases and software releases over the vehicle's life.",
    d: "Many things refer to map content: saved places, traffic reports, overlays, cached routes and trips in progress. Identifiers that stay stable, version stamps on stored data, and migration steps when formats change keep these valid. Maps and software update at different times, so compatibility rules must say which pairs work. It is hard because a decision made in the compiler, such as how to number links, appears years later as a broken favorite or a wrong traffic match.",
    k: ["Stable identifiers across releases vs fresh each release: stable keeps references alive and constrains the compiler; fresh is easy and invalidates caches and live data.", "Migrating stored data vs discarding it: migrating preserves the driver's data and adds code to maintain; discarding is simple and annoying."],
    p: ["A map update changing identifiers so favorites, overlays and traffic all point at wrong roads.", "Migration code that is never tested because it runs only once per version."],
    v: "Apply a sequence of map and software updates to a unit holding favorites, a trip and cached traffic and confirm that each item still refers to the correct place or is cleanly invalidated, with no wrong references.",
    dep: ["map-software-compatibility","compiled-map-format","road-network-model"]
  },
  "location-privacy": {
    s: "Treating position and trip history as personal data throughout the design: collecting little, keeping it briefly, protecting it and letting the driver control it.",
    d: "A navigation system knows home, work and habits. Privacy choices affect storage of history, anonymization of traffic reports, what queries are sent to cloud search, what logs contain and how data is handled when the vehicle is sold or shared. Law varies by region and must be reflected in defaults and controls. It is hard because anonymization of trajectories is weak, because useful features, like predicted destinations, depend on history, and because data crosses many components.",
    k: ["Processing on the device vs in the cloud: on the device keeps data local and limits features and model size; cloud is powerful and holds personal data.", "Coarsening or trimming data vs full precision: coarse protects the driver and degrades traffic and search quality."],
    p: ["Debug logs that quietly contain exact coordinates.", "Retention periods defined in policy but not implemented, so data accumulates indefinitely."],
    v: "Trace every outbound request and stored record over a test trip and list the location data in each, confirm each has a purpose, consent and a retention limit, and that trimmed trace ends cannot be used to find home.",
    dep: ["consent-and-data-controls","probe-data-reporter","secure-storage-and-keys"]
  },
  "regional-variation": {
    s: "The ways navigation differs by country and market: driving side, units, address and naming conventions, signs, legal restrictions, languages and data availability.",
    d: "Driving side changes roundabout and U-turn logic; address formats change parsing; sign shields and exit numbering change instruction text; speed limit rules, restrictions on features like speed camera warnings and on text entry differ by law. Map sources and traffic coverage vary. Each market needs data, translations, voices and certification. It is hard because assumptions made for the first market are hidden throughout the code, and because testing in each region needs local roads and local speakers.",
    k: ["One global codebase with region configuration vs regional forks: configuration shares fixes and needs disciplined abstraction; forks are fast to start and diverge.", "Shipping all regions on every unit vs per market: all regions support travel and use storage; per market is lean and strands cross-border drivers."],
    p: ["Roundabout logic assuming driving on the right, giving mirrored exit directions in other countries.", "A feature that is illegal in a market left enabled because the default came from another."],
    v: "Run a standard scenario suite per market with local test routes and speakers, and verify driving side behavior, units, address parsing and legal feature switches against the market's requirements list.",
    dep: ["localization-and-units","address-parser","maneuver-extractor","road-attribute-layers"]
  },
});
