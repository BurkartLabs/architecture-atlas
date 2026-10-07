// Details for the digital twin plate, part 4: state synchronization and the asset model.
ATLAS.details("digital-twin", {
  "current-state-store": {
    s: "Holds the latest known value, quality and timestamp of every property of every asset, serving fast reads and change notifications for views, analytics and APIs.",
    d: "A keyed store maps asset and property to the most recent accepted value with its source time, arrival time and quality flag, plus derived values such as modes and indicators. Updates from ingestion replace entries atomically and emit change events. It is kept in memory with persistence for recovery, and partitioned by asset for scale. The difficulty is volume and consistency: hundreds of thousands of properties change each second, and a reader assembling one asset's state must not see half of an update.",
    k: ["In-memory store with snapshots vs durable database for state: memory gives low latency and needs rebuild after loss; a database is durable and slower for hot reads.", "Per-property updates vs per-asset updates: per-property is simple and can show a mixed state; per-asset is consistent and requires batching."],
    p: ["After a restart, the store serves old values as if they were current, with no sign they are stale.", "A hot asset updating thousands of times per second overloads its partition."],
    v: "Restart the store during live ingest and confirm it rebuilds to the latest values within the stated time, showing stale markers until fresh data arrives, and that a multi-property read never mixes two update batches.",
    dep: ["time-series-store", "message-broker", "quality-flags", "asset-hierarchy"]
  },
  "state-estimation": {
    s: "Combines noisy, partial and conflicting measurements with a model to estimate the true state of an asset, including quantities no sensor measures directly.",
    d: "Estimators such as Kalman-type filters or moving-horizon methods predict state with a model, then correct it with measurements weighted by their uncertainty. Redundant sensors improve the estimate; a missing sensor is replaced by model inference. The output state, with covariance, feeds the twin's current state, simulation initialization and residual detection. The hard part is tuning noise assumptions and handling bad measurements: an estimator that trusts a failed sensor drags the whole estimate with it.",
    k: ["Model-based filtering vs direct sensor values: filtering gives smoother, complete state and depends on the model; direct values are simple and inherit all sensor faults.", "Recursive filter vs batch smoothing: a filter runs live with low delay; smoothing is more accurate on history and cannot run in real time."],
    p: ["Noise settings tuned in one regime make the filter sluggish or jumpy in another.", "A sensor that failed without a flag pulls the estimated state away from reality."],
    v: "Feed the estimator recorded data with one sensor deliberately corrupted and confirm the estimate stays within its stated uncertainty of the known true state and the bad sensor is identified.",
    dep: ["physics-based-models", "reduced-order-models", "quality-flags", "redundant-sensor-voting"]
  },
  "reported-and-desired-state": {
    s: "Separates what the physical asset reports from what the platform wants it to be, tracking the gap so configuration changes are applied, confirmed and retried.",
    d: "Each controllable property has a reported value from the device and a desired value set by a user or application. The platform stores both, sends the desired value through the write path when permitted, and marks the property converged when the report matches. Devices that are offline pick up the desired state on reconnect. The same pattern covers firmware versions and configuration. The hard part is what happens to disagreements: timeouts, rejected changes and local overrides must all be visible, not assumed away.",
    k: ["Desired-state reconciliation vs imperative commands: reconciliation retries and converges after outages; commands are immediate and say nothing about the final outcome.", "Platform wins vs device wins on conflict: platform wins keeps fleet consistency; device wins respects local operators and permits drift."],
    p: ["A desired value applied to a device after hours offline moves equipment unexpectedly.", "Rejected changes are not surfaced, so the twin shows a setting the device never accepted."],
    v: "Set a desired value on an offline device, reconnect it, and confirm the change applies once, the report converges and the history shows the request, the application time and who asked.",
    dep: ["current-state-store", "write-back-gateway", "device-registry", "command-approval-workflow"]
  },
  "time-alignment": {
    s: "Puts readings from sources with different clocks, rates and delays onto a common timeline, so values from different sensors can be combined and compared correctly.",
    d: "Each reading carries a source timestamp and an arrival timestamp. Alignment corrects known clock offsets, converts to a single time base, and resamples or interpolates to a shared grid when analytics need synchronized values. It records the maximum skew it assumes and flags sources whose clocks wander. Event ordering across assets depends on it. The hard part is that many devices have unsynchronized clocks, and a few seconds of skew can reverse the apparent order of cause and effect.",
    k: ["Source timestamps vs arrival timestamps: source time reflects when it happened but can be wrong; arrival time is trustworthy and includes unknown delay.", "Interpolate to a grid vs keep irregular samples: a grid makes analytics simple and invents values between samples; irregular data is faithful and harder to use."],
    p: ["A device reset to a default date injects readings years in the past or future.", "Interpolating across a long gap draws a convincing line through data that was never measured."],
    v: "Feed two sensors with a known five-second clock offset and confirm aligned data shows a known simultaneous event at the same instant, and that a source drifting beyond tolerance is flagged.",
    dep: ["device-registry", "message-broker", "time-and-clocks"]
  },
  "late-and-out-of-order-data": {
    s: "Handles readings that arrive after newer ones or after their time window has closed, deciding what to update, what to recompute and what to discard.",
    d: "Networks and edge buffering mean data arrives late, sometimes by hours after a link outage. The platform keeps watermarks that declare how late data may arrive, applies late readings to history, and decides whether to replay derived calculations such as rollups and indicators. Current state must not regress to an older value when a stale reading arrives afterward. The hard part is correctness at a cost: reprocessing everything downstream for each late point is expensive.",
    k: ["Strict watermark with drops vs open-ended correction: a strict watermark bounds work and loses very late data; open-ended correction is complete and keeps derived values changing.", "Last-arrival wins vs latest-timestamp wins: latest-timestamp keeps state truthful and requires trusting timestamps; last-arrival is simple and can regress state."],
    p: ["A buffered reading flushed after reconnection overwrites the current value with an old one.", "Alarms are raised on a late reading about a condition that ended an hour earlier."],
    v: "Disconnect an edge gateway for an hour, reconnect, and confirm history is filled in order, current state never moves backward, and rollups for the gap are recomputed.",
    dep: ["time-alignment", "store-and-forward", "backfill-and-reprocessing", "current-state-store"]
  },
  "twin-divergence-detection": {
    s: "Measures how far the twin's model-predicted state has drifted from observed reality and raises the alarm when the twin can no longer be trusted as a stand-in.",
    d: "The detector compares model predictions with measurements, checks structural agreement such as whether modeled relationships still hold, and tracks which assets were changed physically without the model being updated. It produces a trust score per asset and flags a twin that has gone out of step. It prompts recalibration, a model fix or a survey. The hard part is cause: divergence can mean the asset changed, the sensors failed or the model was always wrong.",
    k: ["Continuous scoring vs checks at intervals: continuous catches drift quickly and costs compute; intervals are cheap and leave a window of untrusted use.", "Automatic model correction vs flag for review: automatic keeps the twin aligned and can hide a real fault; review is safer and slower."],
    p: ["An out-of-date twin keeps feeding analytics and decisions with confidence that is no longer earned.", "Divergence is reported without saying whether data or model is more likely wrong."],
    v: "Change a parameter in a test asset's simulated behavior without updating its model, and confirm a divergence score crosses its limit within a stated time and the report separates model error from sensor error.",
    dep: ["state-estimation", "model-calibration", "quality-flags", "physics-based-models"]
  },
  "state-snapshots": {
    s: "Stored complete images of the twin's state at chosen moments, used as starting points for simulation, for reproducing incidents and for fast reconstruction of history.",
    d: "A snapshot captures the asset model version, all property values with quality, estimated state and operating modes at one instant, with consistency across assets. Snapshots are taken on a schedule, on events such as alarms, and on user request, and are stored compactly using differences from earlier ones. History reconstruction starts from the nearest snapshot and applies changes forward. The hard part is a consistent cut across a distributed set of data sources.",
    k: ["Frequent full snapshots vs sparse snapshots plus event replay: frequent are fast to restore and use more storage; sparse are compact and slower to reconstruct.", "Snapshot at event time vs snapshot at fixed times: event-time snapshots capture incidents precisely; fixed times give regular coverage."],
    p: ["A snapshot built from values of different ages gives a state that never existed.", "The model schema changes and old snapshots can no longer be loaded."],
    v: "Take a snapshot during a known steady period, restore it into a clean environment, and confirm every property equals the recorded value at that timestamp and the schema version is recorded.",
    dep: ["current-state-store", "time-series-store", "schema-versioning"]
  },
  "change-propagation": {
    s: "Distributes state changes to everything that depends on them, such as views, analytics, rules and subscribers, in a controlled order and without overloading any of them.",
    d: "When a property changes, the platform determines what depends on it: derived properties, rules, bound views, subscriptions. It notifies them through a dependency graph and an event bus, batches rapid updates, and applies rate limits per consumer. Derived values are recomputed in dependency order. The hard part is cascades: a change at a shared upstream asset can fan out to thousands of dependents, and cycles in derived properties can loop forever.",
    k: ["Push on every change vs coalesced updates: push is immediate and expensive for fast signals; coalescing is cheap and shows slightly delayed values.", "Eager recomputation of derived values vs lazy on read: eager makes reads fast and burns compute; lazy saves work and slows the first read."],
    p: ["A derived property defined in terms of itself loops until the platform runs out of memory.", "One busy asset's events delay every other subscriber on the same bus."],
    v: "Change an upstream property with a known set of dependents and confirm each is updated once, in dependency order, within the stated latency, and that a deliberately created cycle is rejected at definition.",
    dep: ["current-state-store", "message-broker", "relationship-graph", "telemetry-schema"]
  },
  "asset-type-library": {
    s: "The reusable definitions of kinds of asset, such as pump, chiller or transformer, listing their properties, telemetry, commands, relationships and default behavior.",
    d: "A type declares its properties with units and ranges, the telemetry it emits, commands it accepts, allowed relationships, default views, rules and models. Types can extend others, so a specific pump inherits general rotating equipment. New assets are created from a type and receive everything it defines. The library is the point where engineering knowledge becomes reusable. The hard part is granularity and standards: too generic loses meaning, too specific multiplies types nobody can maintain.",
    k: ["Deep inheritance vs composition of capabilities: inheritance is simple to read and rigid; composition is flexible and harder to reason about.", "Adopt an industry vocabulary vs define a private one: a shared vocabulary eases integration and rarely fits exactly; a private one fits and isolates you."],
    p: ["Dozens of near-duplicate types appear because teams cannot find the right existing one.", "A type change propagates to hundreds of instances and breaks bindings and rules."],
    v: "Create an asset from a type and confirm it receives the declared properties, default view and rules automatically, and that changing the type produces a list of affected instances before it is applied.",
    dep: ["units-and-semantics", "telemetry-schema", "schema-versioning"]
  },
  "asset-hierarchy": {
    s: "The structural tree of the plant, such as enterprise, site, area, line, machine and component, which provides roll-up, navigation and the meaning of where something is.",
    d: "Each asset has a parent, so the hierarchy supports navigation, aggregation of measures upward and inheritance of context, such as site time zone and owner. Different hierarchies may coexist, such as location, function and organization, using the same assets. Moves, renames, replacements and splits must keep history meaningful. The hard part is change: when a machine is moved or a component replaced, past data should stay attached to the right identity.",
    k: ["Single canonical hierarchy vs multiple coexisting views: one hierarchy is simple and cannot express function and location; multiple views are expressive and need rules to stay consistent.", "Identity of the physical item vs identity of the position: item identity follows a replaced pump with its history; position identity keeps the slot's history."],
    p: ["A component swap resets the asset's history and loses its wear record.", "Moving a machine to another area silently changes historical roll-ups of both areas."],
    v: "Move a machine between areas and replace one component, then confirm roll-ups at both dates, the asset's own history and navigation all show the right membership at each point in time.",
    dep: ["asset-type-library", "relationship-graph"]
  },
  "relationship-graph": {
    s: "Typed connections between assets, such as feeds, contains, powers, located-in and controls, stored as a graph so questions about topology and dependencies can be answered.",
    d: "Edges carry a type, direction and sometimes properties such as capacity. The graph is queried for upstream and downstream assets, impact of failure, and shortest paths through a process. It underlies alert correlation, impact analysis and diagram generation. It is built from engineering data and edited in the platform. The hard part is accuracy: connections change in the field, such as bypasses and temporary hoses, and a graph out of date with reality gives plausible, wrong impact answers.",
    k: ["Graph store vs relationships as references in a relational model: a graph store makes traversals natural; relational references are simple and traversals are slow at depth.", "Design topology vs observed topology: design is clean and drifts; observed from data is current and noisy."],
    p: ["A temporary bypass is never recorded, so failure impact analysis misses a real path.", "Edges without direction or type make traversal results meaningless."],
    v: "Ask for everything downstream of a given asset and compare the answer with the plant's piping or wiring drawings, and confirm a recent field change appears after the model is edited.",
    dep: ["asset-hierarchy", "asset-type-library"]
  },
  "spatial-reference-frames": {
    s: "The coordinate systems that place assets in space, from a building grid to world coordinates, and the transforms between them, so geometry, scans and maps line up.",
    d: "Each facility has a local frame; each asset has a pose relative to its parent, and the chain of transforms gives its position in the site and world frames. Scans, drawings and positioning devices each use their own frame, so the platform stores transforms with their accuracy and date. Moving a skid moves everything on it. The hard part is accuracy and consistency: small errors in a parent's frame accumulate for every child, and mixed units or axis conventions misplace assets badly.",
    k: ["Hierarchical relative poses vs absolute positions: relative poses move groups with one edit; absolute positions are simple to query and every move needs many updates.", "Survey-accurate placement vs approximate placement: surveyed is trustworthy for augmented overlays and expensive; approximate is quick and enough for schematic use."],
    p: ["Axes in different conventions place a model mirrored or rotated ninety degrees.", "A single survey error in a site frame shifts every asset on a map."],
    v: "Place three surveyed reference points through the transform chain and confirm each lands within the stated tolerance of its measured world position, and that moving a parent moves all its children.",
    dep: ["asset-hierarchy", "units-and-semantics"]
  },
  "telemetry-schema": {
    s: "Declares each property and signal an asset has: name, type, unit, range, sampling expectation and whether it is measured, calculated or set, so data can be checked and interpreted.",
    d: "The schema separates telemetry, which is time-varying, from static properties and commands. For each, it states data type, engineering unit, valid range, expected rate and quality behavior. Ingestion validates against it, views and analytics read it to know what to show, and storage uses it to choose encodings. The hard part is evolution: devices change firmware and payloads, and the schema must adapt without breaking history or consumers.",
    k: ["Strict schema enforced at ingest vs schema-on-read: strict catches errors early and rejects data from new devices; schema-on-read accepts everything and finds problems late.", "Fine-grained properties vs structured payload types: fine-grained is easy to query; structured types keep related values together and are harder to evolve."],
    p: ["A firmware update changes a field's unit and all downstream values silently shift.", "Optional fields become mandatory in practice, and consumers crash when they are absent."],
    v: "Send a payload with a wrong type and an out-of-range value and confirm each is rejected or flagged with a clear reason, and a valid payload is stored with its declared unit.",
    dep: ["units-and-semantics", "asset-type-library"]
  },
  "units-and-semantics": {
    s: "Attaches engineering units and standard meaning to every value, and converts between them, so a temperature in one system is never mistaken for a different quantity in another.",
    d: "Each property has a quantity kind, such as pressure or flow, and a unit. The platform converts for display and for models, and refuses meaningless operations such as adding pressure to temperature. Semantic tags link properties to a shared vocabulary so that tools from different vendors agree what a supply temperature is. The hard part is legacy: tags named by hand in control systems carry meaning only in their names, and mapping them is manual and error-prone.",
    k: ["Store canonical units vs store source units: canonical makes comparison trivial and loses the original; source units preserve fidelity and need conversion everywhere.", "Rich ontology vs lightweight tags: an ontology allows powerful queries and is hard to maintain; tags are easy and ambiguous."],
    p: ["A mixed Celsius and Fahrenheit feed produces a plausible but wrong average.", "Two different quantities share a tag name pattern and are mapped to the same property."],
    v: "Ingest a value in a non-canonical unit, confirm the stored and displayed values convert correctly, and confirm an operation combining incompatible quantity kinds is rejected.",
    dep: []
  },
  "schema-versioning": {
    s: "Tracks changes to asset types, properties and relationships over time, with compatibility rules and migrations, so history and consumers survive the model evolving.",
    d: "Every change to the model is versioned. Additive changes are compatible; renames, unit changes and removals are breaking and need a migration, which can rewrite stored data or add a mapping. Instances record which version they conform to, and queries can ask for data as of a version. Changes go through review. The hard part is that a twin is long lived: models change monthly while history, simulations and external integrations depend on old versions for years.",
    k: ["Migrate data forward vs keep old data under old schema: migrating gives one clean model and risks errors on history; keeping is safe and forces every reader to handle versions.", "Rolling updates vs coordinated cutover: rolling avoids downtime and mixes versions; cutover is clean and needs a window."],
    p: ["Renaming a property orphans its history under the old name.", "Consumers pinned to an old version are never told it will be retired."],
    v: "Rename a property through a migration and confirm queries by the new name return the full old history, queries by the old name resolve through a mapping, and a consumer on the old version still works.",
    dep: ["asset-type-library", "telemetry-schema"]
  },
  "instance-provisioning": {
    s: "Creates and configures twin instances for real assets in bulk, from a type, a template and source data, binding each to its devices and place in the hierarchy.",
    d: "Provisioning reads asset lists from engineering or maintenance systems, creates instances of the right type, sets parents and relationships, assigns device identities and point mappings, and applies default views and rules. It can be run as a batch for a new plant or one at a time at commissioning. It checks for duplicates and missing data and reports what it could not complete. The hard part is source quality: asset lists are inconsistent, and automatic matching of tags to properties is wrong often enough to need review.",
    k: ["Automatic matching of tags to properties vs manual mapping: automatic scales to thousands of points and makes mistakes; manual is accurate and slow.", "Create on first data vs provision ahead of time: on first data needs no setup and creates strays; ahead of time is orderly and needs advance work."],
    p: ["Duplicate assets are created when the same machine appears in two source lists.", "A mapping error attaches a pressure signal to a temperature property and nothing flags it until a model fails."],
    v: "Provision a test plant from a source list and confirm every asset exists once with parent, type and mappings, that sample values flow into the correct properties, and that a malformed row is reported, not skipped silently.",
    dep: ["asset-type-library", "asset-hierarchy", "point-mapping", "device-registry", "engineering-data-import"]
  },
  "engineering-data-import": {
    s: "Brings existing engineering information into the model: equipment lists, process and instrument diagrams, building models and electrical single-line drawings, turning them into assets and relationships.",
    d: "Importers parse structured exports and sometimes extract data from drawings, then map their entities to asset types and their connections to relationships. Imports are repeatable, so a revised drawing updates the model through a diff, not a rebuild. Provenance records which source produced each element. The hard part is quality and ownership: engineering data is often incomplete, inconsistent between disciplines and out of date, and importing it turns every error into the twin's error.",
    k: ["One-time import vs continuous synchronization: one-time is simple and the model drifts away from the source; continuous stays aligned and needs conflict rules.", "Import everything vs import what the twin uses: everything is complete and unwieldy; selected is lean and may miss what later analytics need."],
    p: ["A reimport overwrites manual corrections made in the twin.", "Different disciplines name the same equipment differently, so one machine becomes two assets."],
    v: "Import a drawing set, then revise one line in the source and reimport; confirm only that change appears in the model, manual edits remain, and every element lists its source and import time.",
    dep: ["asset-type-library", "relationship-graph", "asset-hierarchy", "data-lineage-and-provenance"]
  },
  "document-and-thread-links": {
    s: "Links each asset to its documents and records, such as drawings, manuals, inspection reports and as-built data, forming a digital thread from design to operation.",
    d: "Assets hold references to documents in other systems, with type, version and status. Opening an asset shows the relevant procedures, certificates and past work. The thread also connects design requirements to as-built configuration and to operating history, which supports change impact analysis and audits. The hard part is that documents live in other systems with their own versions: links break, point to superseded revisions, or exist for equipment that has since been modified.",
    k: ["Store references vs copy documents into the platform: references avoid duplication and break when sources move; copies are available and become stale.", "Automatic linking by tag vs curated links: automatic covers everything and adds wrong matches; curated is accurate and incomplete."],
    p: ["A link points to a superseded procedure and a technician follows it.", "Links to a decommissioned document system silently return errors."],
    v: "Open ten assets and confirm each shows its current manual and latest inspection report, that a link to a superseded revision is marked, and that a broken link appears on a report.",
    dep: ["asset-hierarchy", "twin-access-control"]
  },
});
