// Details part 1: engineering & change, plant data, recipes & batch.
ATLAS.details("industrial-control", {
  "engineering-workstation": {
    s: "The computer on which control engineers write, configure, download and diagnose controller programs and device settings, usually with vendor-specific software.",
    d: "It holds the project, talks to controllers over the control network, compiles logic into controller code and downloads it. It can also read live values, force points and compare the offline project with what is running. Because it can change any controller it reaches, it is the most privileged machine in the plant. It is hard because the software is tied to controller firmware versions, often runs on aging operating systems, and is used by contractors who move between sites.",
    k: ["Dedicated, locked-down workstations versus engineers' own laptops: dedicated machines limit malware and version drift, but slow urgent fixes and need spares kept alive for years.", "Permanent connection to the control network versus connect-on-demand: permanent is convenient for diagnosis, but leaves a high-privilege path open at all times."],
    p: ["A contractor laptop carrying malware or a mismatched software version is plugged into the control network and changes or infects controllers.", "The only workstation that can open an old project dies, and the project cannot be read on newer software."],
    v: "On a test controller, connect the workstation, compare the offline project with the running one, and confirm it lists every differing block. Then confirm an unauthorized workstation cannot download.",
    dep: ["iec-61131-languages","device-description-files","control-project-repository"]
  },
  "iec-61131-languages": {
    s: "The standardized family of controller programming languages: ladder diagrams, function block diagrams, structured text, sequential function charts and instruction lists, chosen by who maintains the logic.",
    d: "Logic is written in a graphical or text form, compiled to controller code and executed once per scan. Ladder resembles relay wiring, so electricians can read it; function block diagrams suit signal flow and loops; structured text suits arithmetic and data handling; sequential function charts describe step-by-step procedures. Programs are organized in programs, function blocks and functions with typed variables. The difficulty is that maintainers are often not programmers, so clarity, naming and consistent patterns matter more than cleverness.",
    k: ["Ladder versus structured text: ladder is readable at the plant floor and easy to troubleshoot online, but complex math and data handling become sprawling and hard to review.", "Reusable typed blocks versus copy-and-edit logic: reuse gives one place to fix a bug, but a change then touches every instance in the plant."],
    p: ["Copied logic drifts between instances, so the same fix is applied to nine of ten pumps.", "Unlabeled addresses and unstructured rungs make a midnight troubleshooting session depend on one person's memory."],
    v: "Open a pump control block in the engineering tool, monitor it online, and step a start command through to its output. A technician who did not write it should be able to explain each rung.",
    dep: ["engineering-workstation","function-block-library"]
  },
  "control-project-repository": {
    s: "The versioned store of controller programs, configuration, HMI projects, drawings and parameter sets, so that what is running can be compared with what was approved.",
    d: "Projects are saved with a version, author and reason, and often compared automatically with the running controllers to detect unapproved changes. Many control platforms store binary projects, so diffing and merging are limited and some sites export to text. Backups of the as-running state are taken on a schedule, separately from the engineering history. It is hard because the ground truth is the running controller, not the file, and because changes made online during an emergency are easily never saved back.",
    k: ["Central repository with check-in versus files on the workstation: central gives history and review, but needs discipline and tooling that the vendor software may not support.", "Comparing running state to the repository automatically versus periodic audits: automatic detection finds drift in hours, but produces noise from legitimate online edits."],
    p: ["An online fix made at night never reaches the repository, and a later download from the old project undoes it.", "Backups exist but were never tested, and restoring one fails on a firmware mismatch."],
    v: "Make a trivial online change to a test controller and confirm the comparison job reports the difference within its interval. Then restore the repository version to a spare controller and confirm it starts.",
    dep: ["engineering-workstation","change-management-workflow"]
  },
  "device-description-files": {
    s: "Machine-readable files from device makers that describe a device's parameters, data layout and diagnostics, so engineering tools can configure it without custom code.",
    d: "Each device type ships a description of its identifiers, process data mapping, configurable parameters, ranges and units. The engineering tool imports it to build the network configuration and to show a parameter dialog. At startup the controller checks that the connected device matches the configured identity and version. It is hard because versions multiply: a replaced device with newer firmware may need a newer description, and a mismatch can block startup.",
    k: ["Strict identity matching at startup versus accepting compatible devices: strict catches wrong parts, but a replacement with a harmless revision change stops the line until reconfigured.", "Vendor-neutral description formats versus tool-specific import: neutral formats ease mixing vendors, but cover the common cases and leave extras to vendor tools."],
    p: ["A spare part arrives with a newer revision and the controller refuses to start the network until someone finds the matching file.", "A description file with the wrong scaling is imported and every reading is off by a constant factor."],
    v: "Import a description file for a device, add it to a test network, and confirm its parameters show with correct units. Swap in a different revision and confirm the controller reports the mismatch clearly.",
    dep: ["engineering-workstation"]
  },
  "virtual-commissioning": {
    s: "Testing controller logic against a simulated plant model before it reaches real equipment, to find logic errors, sequence faults and interlock gaps while mistakes are free.",
    d: "The real controller code, or an emulation of it, is connected to a model of the process or machine that responds to outputs and produces inputs. Engineers run normal operation, start-up, shutdown and fault cases and compare results with the functional specification. Factory acceptance testing uses the same idea with real hardware and simulated field signals. It is hard because the value of the test depends on model fidelity: a model too ideal passes logic that real valves, delays and noisy sensors will break.",
    k: ["High-fidelity process model versus simple signal simulator: fidelity finds tuning and timing problems, but costs modeling effort that few projects budget.", "Emulated controller versus real controller hardware in the loop: emulation scales and is cheap, but can hide scan timing and memory behavior that only hardware shows."],
    p: ["The simulator responds instantly, so logic that depends on a valve taking eight seconds to open passes the test and fails on site.", "Test coverage skips fault injection, so the first sensor failure happens in production."],
    v: "Run the start-up sequence against the model, then inject a failed level transmitter and confirm the logic trips to the documented state with the documented alarm.",
    dep: ["iec-61131-languages","sequence-control","function-block-library"]
  },
  "change-management-workflow": {
    s: "The approval process that governs changes to logic, setpoints, alarms and network configuration: request, risk review, test, authorization, implementation, record and rollback plan.",
    d: "A change is described, assessed for its effect on safety, production and security, tested offline, approved by the right people and scheduled. The implementation is recorded against the request, and the repository and documentation are updated. Emergency changes follow a shorter path with later review. Safety-related changes carry extra steps such as re-verification. It is hard because the plant's culture is to fix the problem now, and any process slower than the fix will be bypassed.",
    k: ["Tiered review by risk versus one process for all changes: tiers keep trivial tuning quick, but need clear classification, or risky edits get filed as trivial.", "Emergency change with after-the-fact review versus blocking until approved: after-the-fact keeps production moving, but can become the normal route if reviews lag."],
    p: ["A setpoint tweak on a safety limit is classed as routine and skips review, and nothing records why it was moved.", "The approval record exists but the implemented change differs from what was approved."],
    v: "Pick a recent change and trace it from request to the repository diff and the audit trail entry. Every step should name a person, a date and the same change content.",
    dep: ["control-project-repository","audit-trail","online-changes-and-downloads"]
  },
  "online-changes-and-downloads": {
    s: "Modifying or replacing logic in a controller while it keeps running the process, using partial downloads, forced values or full program replacement during a stop.",
    d: "Many controllers accept an edit to a running program and apply it at a scan boundary; others need a stop and full download. Online edits preserve variable values but can briefly stall the scan or reset state. Forcing overrides an input or output regardless of logic, and must be tracked and removed. Download tools compare versions and warn about differences. It is hard because a safe edit depends on how the runtime applies it, and a mistake affects live equipment immediately.",
    k: ["Online edit versus stop-and-download: online avoids a production stop, but a bad edit acts immediately and may cause a scan overrun or lose retained state.", "Allowing forces versus prohibiting them: forces let maintenance test around a failed sensor, but a forgotten force silently disables protection."],
    p: ["A force placed during maintenance is left in place for months and masks a real fault.", "An online edit lengthens one scan beyond the watchdog limit and the controller faults and stops."],
    v: "On a test controller, make an online edit and confirm the maximum scan time stays within its limit. List active forces and confirm each has an owner and a removal date.",
    dep: ["engineering-workstation","scan-cycle","watchdog-and-faults"]
  },
  "process-historian": {
    s: "A purpose-built time-series store that records process values with timestamps and quality, at high rate and for years, and serves them back for trends and analysis.",
    d: "Collectors read tags from controllers or the supervisory server and write time-stamped values with a quality flag into a store optimized for appends and time-range reads. Values are compressed, archived by age and queried by tag and interval, often with interpolation or aggregates such as averages per hour. The historian is read by trends, reports and analytics. It is hard because writes are continuous, outages create gaps, clocks disagree, and queries over years of high-rate data must still be fast.",
    k: ["Purpose-built historian versus a general database: a historian handles rate, compression and gaps well, but gives less flexible joins with business data.", "Collect everything versus a selected tag list: everything allows later investigation, but multiplies storage and licenses for values nobody reads."],
    p: ["A collector fails quietly and a week of values is missing, found only when an investigation needs it.", "Values with bad quality are charted as if good, producing plausible but false averages."],
    v: "Stop a collector for ten minutes, restore it, and confirm the trend shows either buffered backfill or an explicit gap marked as such, never an interpolated line.",
    dep: ["historian-compression","store-and-forward-buffering","tag-namespace","real-time-tag-database"]
  },
  "historian-compression": {
    s: "Rules that store a value only when it has changed enough to matter, so the historian keeps the shape of a signal while discarding repeated readings.",
    d: "A deadband filter drops a value that stays within a tolerance of the last stored one. Swinging-door and similar algorithms store only the points needed to reproduce the line within a stated error. Each tag has its own tolerance, based on instrument accuracy. Reads reconstruct values between stored points by interpolation. It is hard because compression is lossy and permanent: a tolerance set too wide erases real small events, such as a slow leak, and cannot be recovered afterwards.",
    k: ["Wide deadband versus narrow deadband: wide saves storage and makes trends smooth, but loses small excursions that investigations later need.", "Compression at the collector versus in the historian: at the collector it saves network and buffer space, but fixes the tolerance before anyone knows what is interesting."],
    p: ["A deadband set to a percentage of a large range hides every change smaller than one process unit.", "Interpolated trend lines between sparse points are mistaken for measured data."],
    v: "Feed a recorded signal containing a small known step through the compression settings and confirm the step appears in the stored data and trend with the right size and time.",
    dep: ["process-historian","sensors-transmitters"]
  },
  "store-and-forward-buffering": {
    s: "Local storage in a collector or gateway that holds values while the link to the server is down and replays them in order when it returns.",
    d: "A collector near the source writes values to a local disk or memory queue as it reads them, sends them upstream, and removes them once acknowledged. After an outage it sends the backlog, usually in timestamp order, while still delivering live values. The queue has a size limit and a policy for when it fills. It is hard because replay must not duplicate or reorder data, must not swamp the receiver, and must keep the original timestamps rather than the arrival time.",
    k: ["Buffer on disk versus in memory: disk survives a restart and holds days, but is slower and wears out, while memory is fast and lost with the process.", "Replay oldest first versus newest first: oldest first keeps ordered history, but delays live values after a long outage unless live data is sent in parallel."],
    p: ["The buffer fills after a three-day outage and silently drops its oldest data.", "Backfilled values are stamped with arrival time and appear as one burst at the moment the link returned."],
    v: "Disconnect a remote collector for an hour while the process changes, reconnect, and confirm the historian holds every value with its original timestamp and no duplicates.",
    dep: ["process-historian","wide-area-telemetry"]
  },
  "tag-namespace": {
    s: "The naming scheme and registry for every data point in the plant, with its units, range, description, source address and owner, shared by controllers, SCADA, HMI and historian.",
    d: "A tag is a named value, such as a pressure or valve position, mapped to an address in a controller. A naming convention encodes area, equipment and signal so that names are unique and predictable. The tag database also holds engineering units, limits, alarm settings and scaling. Changes in one place must reach the others. It is hard because the same signal exists under different names in several systems, and one wrong scale factor or unit makes every downstream number wrong.",
    k: ["Strict naming convention versus free names: strict names make filtering and templates work, but are costly to apply to a plant that already has years of names.", "One master tag list versus each system's own database: a master prevents drift, but needs tooling to push changes to every system."],
    p: ["Two systems use the same tag name for different signals after a merger of projects.", "Units are changed in the controller from kPa to bar and the historian keeps the old scale."],
    v: "Choose ten tags and trace each from field instrument to controller address, SCADA tag, HMI object and historian record, confirming name, unit and range agree at every hop.",
    dep: ["real-time-tag-database","asset-model"]
  },
  "audit-trail": {
    s: "A tamper-evident log of who changed what, when and why: logic downloads, setpoints, alarm limits, user accounts and operator actions.",
    d: "Systems write an entry for each configuration or control action, with user, time, old and new values and often a reason. Entries are append-only, protected from edit and copied to a separate store so a compromised machine cannot erase them. Regulated industries require it for electronic records. It is hard because the information is spread across controllers, servers and engineering tools with different formats and clocks, and a log nobody reviews does not detect anything.",
    k: ["Central collection versus per-device logs: central logs resist local tampering and allow correlation, but controllers with little memory may not produce rich entries.", "Mandatory reason for each change versus optional comment: reasons make the record useful, but operators under pressure type placeholder text."],
    p: ["Clocks differ by minutes between systems, so the order of events across them cannot be reconstructed.", "Shared logins record a team's changes under one name, which makes the log useless for accountability."],
    v: "Change an alarm limit on a test system and confirm an audit entry appears in the central store with user, time, old and new value, and that the entry cannot be edited by that user.",
    dep: ["user-roles-and-access","tag-namespace","data-trust-and-time"]
  },
  "asset-model": {
    s: "A hierarchy of sites, areas, units and equipment that gives raw tags context, so a value can be found, compared and aggregated by what it belongs to.",
    d: "Equipment is arranged in a tree, such as site, area, line, unit and device, and each node has tags, attributes and relations. Templates define what every pump or tank has, so new instances inherit structure. Reports, trends and analytics query by node rather than by tag name. It is hard because it is a second description of the plant that must stay in step with the real one, and because there are several valid hierarchies, such as physical, functional and process.",
    k: ["Template-based modeling versus hand-built per-asset structure: templates give consistency and fast rollout, but force awkward fits for equipment that is slightly different.", "Single hierarchy versus multiple views: one tree is simple to maintain, but cannot serve both maintenance and operations ways of grouping."],
    p: ["A unit is rebuilt in the field and the model is not updated, so reports aggregate from decommissioned equipment.", "Templates are copied and edited rather than versioned, and instances diverge."],
    v: "Pick a pump, find it by its place in the hierarchy, and confirm its live value, historian trend and alarms all resolve to the same physical device. Then move it in the tree and confirm reports follow.",
    dep: ["tag-namespace"]
  },
  "enterprise-integration": {
    s: "The interfaces that move production, quality and energy data between the plant and business systems such as planning, maintenance and quality, across a controlled boundary.",
    d: "Orders and recipes flow down from planning; quantities, downtime and quality results flow up. Exchange uses defined data models and message or file interfaces through an intermediate server in the demilitarized zone, not a direct connection to controllers. Mapping converts between plant identifiers and business identifiers. It is hard because the two sides have different clocks, tolerances for delay and idea of what a batch, order or asset is, and because every connection is also an attack path.",
    k: ["Standard data models versus point-to-point custom mapping: standards lower cost across many plants, but real sites still need adapters for local meaning.", "Pull from the DMZ versus push into the control network: pulling keeps control networks closed to inbound connections, but adds latency and needs the data staged outside."],
    p: ["A planning system sends an order for a product with an inactive recipe and nothing validates it before it reaches the line.", "A direct database link from the business network to the historian becomes the route for an intrusion."],
    v: "Create a test order in the business system and confirm it appears in the plant system with the right product and quantity, and that results post back. Confirm no inbound connection reaches a controller.",
    dep: ["industrial-dmz","process-historian","work-orders-and-scheduling"]
  },
  "recipe-management": {
    s: "The store of product definitions: ingredients, quantities, process parameters and procedure, kept separate from the equipment so one plant can make many products.",
    d: "A recipe has a header, a formula of materials and amounts, equipment requirements and a procedure of operations with parameters such as temperatures and times. General recipes describe the process, and master or control recipes bind it to specific equipment. Versions are approved before use. It is hard because recipe changes alter products and compliance status, so they need version control and approval, and because a recipe must be valid for the equipment actually available that day.",
    k: ["Recipe separate from equipment logic versus recipes hard-coded in the controller: separation lets operators add products without reprogramming, but needs an equipment model general enough to carry the parameters.", "Parameter limits enforced in the recipe system versus in the controller: controller limits protect the equipment even from a bad recipe, at the cost of a duplicate limit to maintain."],
    p: ["An unapproved recipe revision is downloaded and run, and product is made to the wrong specification.", "A recipe valid on one reactor is run on another with different volume and overfills it."],
    v: "Release a new approved recipe version, start a batch, and confirm the batch record cites that version and the controller received exactly its parameters. Try an unapproved version and confirm it is refused.",
    dep: ["batch-engine","audit-trail","equipment-phases"]
  },
  "batch-engine": {
    s: "The program that executes a recipe: it chooses equipment, steps through the procedure, starts equipment phases, handles holds and failures, and records what happens.",
    d: "The engine takes a control recipe, allocates units, issues commands to equipment phases and waits for each to complete before the next step. Operators can hold, pause, restart or abort. It arbitrates shared equipment between batches running at once and handles exceptions by branching or stopping. It is hard because a batch is a long-running procedure across failures: after a restart or a failover, it must know exactly where each step stood and resume safely.",
    k: ["Engine in a supervisory server versus in the controller: a server handles many units and scheduling, but a server outage can stall batches unless state is kept in the controllers.", "Resume from the failed step versus restart the batch: resuming saves material, but only if the step is safe to repeat or continue."],
    p: ["The engine restarts and replays a charging step, adding the ingredient twice.", "Two batches request the same vessel and both wait for the other, stalling the plant."],
    v: "Abort a running test batch partway, restart the engine, and confirm it reports the exact step and equipment state and offers only actions that are safe from that state.",
    dep: ["recipe-management","equipment-phases","server-failover","batch-record"]
  },
  "equipment-phases": {
    s: "Controller-side programs that perform one defined action, such as charge, heat or agitate, with a standard state model so the batch engine can command any equipment the same way.",
    d: "Each phase implements states such as idle, running, held, aborting and complete, takes parameters from the recipe and reports status. The phase owns the low-level logic and interlocks of the equipment, so the recipe never talks to valves. Commands from the engine change the state, and the phase moves through transitions. It is hard because every phase needs sound behavior in every state, including how to hold safely in the middle of a charge and how to resume.",
    k: ["Standard state model across phases versus phase-specific states: a standard model lets one engine drive all equipment, but forces odd equipment into states that fit poorly.", "Phase logic in the controller versus in the batch server: controller logic keeps running through a server loss, but makes changes a controller download."],
    p: ["A hold command arrives mid-transfer and the phase stops the pump but leaves the outlet valve open.", "Parameters outside the phase's valid range are accepted and the phase runs with them."],
    v: "Command a test phase through run, hold, restart and abort while observing outputs, and confirm each transition leaves valves and drives in the documented state.",
    dep: ["sequence-control","function-block-library","final-control-elements"]
  },
  "genealogy-and-traceability": {
    s: "Records linking every finished lot to the raw material lots, equipment, operators and process conditions that produced it, so a problem can be traced both ways.",
    d: "As material is received, moved and consumed, the system records lot identifiers, quantities and the units and phases involved. Queries then walk upstream to find which supplier lot went into a product, or downstream to find every product made from a suspect lot. Data comes from scanners, scales, controllers and operator entry. It is hard because the physical flow is continuous or blended in places, so a lot boundary is a decision, and because missing a scan breaks the chain.",
    k: ["Automatic capture from scales and scanners versus operator entry: automatic capture is accurate and complete, but needs instruments at each transfer, while manual entry is cheap and error-prone.", "Lot-level versus unit-level tracking: lot level is manageable, but a recall can then include more product than strictly affected."],
    p: ["Two lots are blended in a tank and the system records only one, so a recall cannot be scoped precisely.", "A manual override of a scan is not recorded, and the chain breaks without anyone knowing."],
    v: "Choose one finished lot and produce its full upstream list of raw lots and equipment. Then pick one raw lot and list every finished lot it reached; the totals should balance with recorded quantities.",
    dep: ["batch-engine","tag-namespace","process-historian"]
  },
  "batch-record": {
    s: "The permanent record of one batch: recipe version, materials, parameters, times, operator actions, alarms, deviations and approvals, assembled so that it can be reviewed for release.",
    d: "During execution the engine writes events and values into a record; at the end it is assembled with historian trends, alarms and manual entries into a document reviewed by exception, where only deviations need human attention. Electronic signatures approve it. The record is retained for the period regulators require. It is hard because it combines data from many systems, must not be altered after approval, and must still be readable when the systems that produced it are retired.",
    k: ["Review by exception versus full review: exception review is fast, but trusts that the system detects every deviation, so detection rules must be validated.", "Archive as rendered document versus raw data: a document stays readable for decades, but loses the ability to re-query, while raw data needs the software to survive."],
    p: ["A manual correction after the fact changes a value without a visible trace.", "Records are stored in a format whose software is no longer licensed when an inspector asks."],
    v: "Complete a test batch with one forced deviation, and confirm the record lists that deviation with the user, time and values, and that editing any field after signature is refused.",
    dep: ["batch-engine","audit-trail","process-historian","alarm-engine"]
  },
  "work-orders-and-scheduling": {
    s: "The layer that decides what to produce, in what order and on which equipment, and releases that to the batch engine or line controllers while tracking progress.",
    d: "Orders arrive from planning with product, quantity and due date. Scheduling assigns them to equipment, accounting for changeovers, cleaning, maintenance and material availability, and releases work to the control layer. Progress and results are reported back. It is hard because a plan assumes equipment is available, and the plant disagrees with it constantly: equipment fails, quality holds product, and rescheduling must respect constraints the planner does not see.",
    k: ["Finite capacity scheduling versus simple dispatch lists: finite scheduling finds feasible plans, but depends on accurate equipment states and changeover data that plants rarely keep clean.", "Automatic release to the line versus operator-confirmed release: automatic saves time, but a wrong order starts immediately without a human check."],
    p: ["A schedule ignores a cleaning requirement between products and cross-contaminates a batch.", "Equipment status is updated by hand, so the schedule sends work to a unit that is down."],
    v: "Release a test order for a product that needs a cleaning step, and confirm the schedule inserts it before the next product. Mark a unit down and confirm affected orders are flagged.",
    dep: ["batch-engine","enterprise-integration","asset-model"]
  },
});
