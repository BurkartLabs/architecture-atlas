// Details for the warehouse management plate, part 5: automation and robotics, platform services.
ATLAS.details("warehouse-management", {
  "equipment-gateway": {
    s: "The adapter layer that speaks to each machine controller's protocol and presents all equipment to the warehouse system in one consistent message form.",
    d: "Conveyors, sorters, storage machines and robots each expose a controller with its own protocol, message set and timing. The gateway translates between those and the system's task and event model, buffers messages, handles reconnects and reports device health. Equipment-level control stays in the controller; the gateway exchanges work orders and status. It is hard because controllers have strict timing, vendors differ, and a gateway outage must not leave machines running on stale instructions.",
    k: ["One gateway for all equipment vs one per equipment family: one is simpler to operate and becomes a single point of failure; per-family isolates faults and multiplies deployments.", "Synchronous request and reply vs asynchronous events: synchronous is easier to reason about, asynchronous tolerates slow machines and demands correlation."],
    p: ["A reconnect that replays old commands makes a machine repeat a move.", "Loss of the gateway link with no heartbeat leaves the system believing machines are idle."],
    v: "Disconnect the gateway link during a test run and confirm health shows down within the heartbeat period, machines complete or stop safely, and on reconnect state is reconciled without repeating any command.",
    dep: ["device-connectivity","message-queue","equipment-fault-handling"]
  },
  "conveyor-control": {
    s: "Directs parcels and totes along conveyors and sorters by scanning each at decision points and telling the controller which way to divert.",
    d: "Scanners at induction and merge points read a barcode and ask the system for the destination, such as a chute, lane or station; the controller diverts the item accordingly. The system must answer within milliseconds because the item is moving. Unreadable barcodes go to a reject lane. Tracking follows an item as it passes sensors. It is hard because the decision deadline is physical: a late answer means the item passes the diverter, and a wrong answer misroutes goods at speed.",
    k: ["Controller asks the system on every scan vs controller holds a local routing table: asking keeps one source of truth and depends on latency; local tables survive outages and go stale.", "Recirculate on failure vs reject to a lane: recirculation retries without staff, rejection avoids loops and needs people."],
    p: ["A slow lookup makes parcels miss their diverters and flood the recirculation loop.", "A full destination chute without a signal blocks the entire sorter."],
    v: "Induct 1,000 labeled parcels at line speed and confirm every one reaches its assigned chute, with unreadable labels in the reject lane and decision response times under the controller's deadline.",
    dep: ["equipment-gateway","sortation","message-queue"]
  },
  "storage-retrieval-interface": {
    s: "Sends store and retrieve commands to automated storage machines, such as shuttles, cranes and vertical lifts, and receives completion and position events.",
    d: "The system sends missions with a container, source, destination and priority; the machine's controller plans motions and reports start, completion and faults. Inventory inside the machine is often tracked by both sides, so the system must keep its record of container locations in step with the controller's. It is hard because two systems each hold location truth, and a fault in the middle of a move leaves a container whose position neither can be sure of.",
    k: ["System owns slot assignment vs controller chooses within the machine: system ownership optimizes across the building, controller choice uses machine-specific knowledge.", "Release missions in advance vs just in time: advance fills the machine's queue and reduces waiting, just in time adapts to priority changes."],
    p: ["A mission interrupted by a fault leaves the container's location unknown to the system.", "Over-filling the controller's queue delays an urgent retrieval behind routine work."],
    v: "Store 100 containers and retrieve 20 at random: each retrieved container arrives at its station, and a full machine inventory comparison between the system and the controller shows zero differences.",
    dep: ["equipment-gateway","inventory-ledger","goods-to-person-stations"]
  },
  "mobile-robot-interface": {
    s: "Sends jobs to a fleet of mobile robots that carry shelves, totes or carts, and tracks their assignments, state and charging.",
    d: "A fleet manager plans routes and traffic; the warehouse system sends high-level jobs such as bring this shelf to station 4, and receives progress and exceptions. Robots charge, queue and avoid each other. The interface maps system locations to the robots' map. It is hard because two layers plan: the warehouse decides what to move, the fleet decides how, and they must agree on priorities, map changes and what to do when robots are out of service.",
    k: ["Jobs at task level vs at mission level with the fleet choosing the details: task level gives control and workload, mission level uses the fleet's traffic knowledge.", "Robots dedicated to a function vs shared across functions: dedicated is predictable, shared uses fewer robots and needs arbitration."],
    p: ["Map changes in the building not mirrored in the interface send robots to blocked spots.", "Robot battery management not coordinated with demand peaks leaves too few robots at the busiest hour."],
    v: "Dispatch 50 jobs to a test fleet, then remove two robots; confirm all jobs still complete, no job is lost or duplicated, and the system shows reduced fleet capacity.",
    dep: ["equipment-gateway","location-master","automation-task-orchestration"]
  },
  "goods-to-person-stations": {
    s: "Workstations where storage machines or robots bring the goods to a stationary worker, who picks or puts at ergonomic height with guidance from the system.",
    d: "The station shows which container has arrived and what to take, usually with lights, and the worker scans or confirms. The system schedules arrivals so the station stays busy without queuing too much. Picks at the station are placed into order containers, often with put-to-light. It is hard because the station's rate depends on delivery sequence from the automation: the system must order the retrievals so that the right containers arrive in the right order, and balance several stations.",
    k: ["Sequence retrievals to stations by order batch vs by arrival: batch order gives full orders at once, by arrival is simple and spreads work across orders.", "Many items per container visit vs one: many visits cut retrievals and need smart grouping."],
    p: ["A station starved of containers because retrieval ordering ignored its speed.", "Order containers filled out of sequence leave orders incomplete at the station."],
    v: "Run a station for an hour: measure picks per hour, confirm containers arrive before the worker finishes the previous one, and orders completed at the station match their lines.",
    dep: ["storage-retrieval-interface","light-directed-stations","automation-task-orchestration"]
  },
  "automation-task-orchestration": {
    s: "Coordinates work across machines and people: what each machine must do, in what sequence, so that goods reach stations and docks without queues or deadlock.",
    d: "A warehouse execution layer takes released orders and breaks them into machine missions, human tasks and transfers, then sequences them by capacity, priority and downstream readiness. It balances the load across machines, buffers and stations, and reacts to faults by replanning. It sits between the host-facing system and the controllers. It is hard because it is a scheduling problem with physical coupling, and decisions made seconds apart interact through shared buffers and conveyors.",
    k: ["Central optimization by one orchestrator vs local rules in each machine: central achieves global flow and is a single point of failure, local is resilient and may starve downstream.", "Plan ahead vs react to events: planning smooths flow and breaks on disruptions, reacting adapts and may thrash."],
    p: ["Planning ahead on stale machine state creates deadlocks at a merge.", "Buffers filled by an upstream stage block the whole line."],
    v: "Run a full shift test with a deliberate machine outage in the middle: orders still complete, buffers never exceed capacity, and replanning restores flow within the stated minutes.",
    dep: ["equipment-gateway","task-engine","wave-planning","continuous-order-streaming"]
  },
  "equipment-fault-handling": {
    s: "Detects machine faults, translates them into system states and tasks, and routes affected goods and work to alternatives or to people.",
    d: "Controllers report jams, errors and offline states. The system marks the equipment unavailable, stops sending it work, finds the goods and orders that were in flight, and creates recovery tasks for people to clear and reintroduce them. It notifies maintenance and replans around the loss. It is hard because faults leave inconsistent state: a tote half-way on a conveyor, a robot with a lost job, and a machine inventory that disagrees with the system.",
    k: ["Stop all dependent work on any fault vs continue around it: stopping is safe and loses throughput, continuing keeps flowing and risks piling into the fault.", "Automatic recovery vs operator-confirmed: automatic is fast and can compound a wrong guess, confirmed is slower and safe."],
    p: ["Faults without in-flight recovery leave goods in limbo for days.", "Alarm floods bury the critical fault."],
    v: "Trigger a jam in a test run and confirm the item is flagged, affected orders are rerouted or held, a recovery task goes to a worker, and normal flow resumes after reset with no lost inventory.",
    dep: ["equipment-gateway","exception-queue","manual-fallback"]
  },
  "automation-simulation": {
    s: "A model of the building and its equipment that replays orders and tests changes in layout, rules or volume before they are tried on the real floor.",
    d: "The model contains the layout, machine speeds, buffers and the system's own release and routing logic, and is driven by recorded or synthetic orders. It estimates throughput, queues and bottlenecks, and tests peak-season scenarios or rule changes. Some models connect to the real system for commissioning. It is hard because a model is only as good as its calibration, and results are accepted without noticing what it left out, such as congestion between people.",
    k: ["Simulate with the real system logic vs a separate model of it: real logic gives credible results and needs a harness, a separate model is quick and may diverge.", "Detailed physical model vs flow-level model: detailed finds local jams, flow-level is quick for what-if volume tests."],
    p: ["An uncalibrated model gives confident but wrong throughput claims.", "Testing average days only misses the peak hour that actually breaks the floor."],
    v: "Calibrate the model against a recorded real day and compare throughput and queue lengths hourly; the model must reproduce them within the stated tolerance before it is used for what-if runs.",
    dep: ["automation-task-orchestration","order-intake","reporting-and-kpis"]
  },
  "manual-fallback": {
    s: "A defined way to keep shipping by hand when automation is down: alternate routes, paper or handheld processes and a path to bring state back.",
    d: "Fallback procedures route goods to manual stations and use handheld confirmation instead of machine events. The system switches affected areas to manual mode, generates equivalent tasks and later reconciles what was done by hand with what the machines believe. Staff are trained to use it. It is hard because it is rarely exercised, so it decays: stations are missing, people have not done it, and re-synchronizing machine and system state afterward is error-prone.",
    k: ["Full manual mode per area vs a degraded automated mode: manual is simple and slow, degraded keeps part of the speed and needs more testing.", "Practice fallback on a schedule vs only in an outage: practice keeps skills alive and costs throughput, outage-only costs nothing until needed."],
    p: ["Fallback never rehearsed fails when the automation actually stops.", "Return to automatic mode without reconciling leaves containers in different places in the machine and in the system."],
    v: "Switch one area to manual mode during a drill and ship a set of orders by handheld only, then switch back and confirm system and equipment inventories agree with no unexplained differences.",
    dep: ["equipment-fault-handling","handheld-scan-app","inventory-ledger"]
  },
  "configuration-rules": {
    s: "Stores the settings and business rules that make each site and owner behave differently, without changing code: allocation, putaway, release, holds and labels.",
    d: "Settings are organized by scope (system, site, owner, item class) with inheritance and effective dates. Rule engines evaluate ordered conditions against orders, items or locations to pick an outcome, such as which location to put away to. Changes are versioned and can be tested before enabling. It is hard because rules compound: dozens of interacting settings make behavior hard to predict, and a mistaken change takes effect on live work.",
    k: ["Rules as data in tables vs a general rule language: tables are simple to edit and limited in expression, a language is powerful and harder to validate.", "Changes apply immediately vs staged with a review: immediate is agile and risky, staged is safe and slower."],
    p: ["An edit with no version history cannot be rolled back when it breaks allocation.", "Rules overlapping at two scopes silently override each other."],
    v: "Change a putaway rule in a test scope and run 20 receipts through simulation, confirming every result follows the new rule, then roll back and confirm the original behavior returns.",
    dep: ["transactional-store","audit-trail","access-control"]
  },
  "workflow-engine": {
    s: "Runs the defined sequence of steps for a process, such as receive, inspect, put away, with branching, waiting and hooks for customer-specific changes.",
    d: "A process definition lists steps, conditions, transitions and who or what performs each, and an instance tracks where each object, such as a receipt or order, is within it. Steps may call tasks, rules, integration messages and approvals. Customization is done by adding steps rather than editing core code. It is hard because long-running instances must survive upgrades, and flexible flows can be configured into states the rest of the system never expected.",
    k: ["Explicit workflow definitions vs hard-coded flow: definitions allow per-owner variation and need careful testing, hard-coding is predictable and rigid.", "Engine owns state vs objects own their own status: engine state is uniform and duplicates, object status is direct and diverges across processes."],
    p: ["A process definition changed while instances are running leaves orders in a retired step.", "Branches added for one customer interact with another customer's flow."],
    v: "Start 10 instances, change the definition, and confirm the running ones finish under the old version while new ones use the new, with no instance stuck.",
    dep: ["transactional-store","configuration-rules","task-engine"]
  },
  "task-engine": {
    s: "The queue of physical work, such as pick, putaway, count and move tasks, with state, priority, assignment and the confirmations that turn tasks into inventory changes.",
    d: "Every unit of floor work is a task with a type, source, destination, quantity, priority, and state from created to complete. Tasks are queued, offered to workers or machines, and confirmed by scan; confirmation posts the ledger movement. Cancellations, splits and reassignments are handled centrally. It is the heart of execution. It is hard because tasks must be exactly-once under retries and device failures, and queue ordering must balance urgency, travel and fairness.",
    k: ["Task confirmation posts the movement in the same transaction vs asynchronously: same transaction is consistent and slower, asynchronous is fast and can briefly disagree.", "Fine-grained tasks per location vs coarse tasks per list: fine adapts to change and increases overhead, coarse is efficient and rigid."],
    p: ["A retried confirmation applied twice moves stock twice.", "Tasks left in assigned state by a worker who logged out hold work hostage."],
    v: "Confirm the same task twice, from two devices, at once: exactly one ledger movement results, the second device is told the task is done, and an abandoned task returns to the queue after its timeout.",
    dep: ["transactional-store","inventory-ledger","inventory-locking","message-queue"]
  },
  "access-control": {
    s: "Decides who may see and do what: roles, permissions per function, site and owner, and approvals for sensitive actions.",
    d: "Users receive roles that grant permissions on functions and data scopes. Floor users authenticate quickly, often by badge scan or short code, while administrators use stronger methods. Sensitive actions such as adjustments or rule edits require approval. It integrates with the company's identity systems. It is hard because floor realities fight security: shared devices and gloved hands encourage shared logins, and a too-strict model slows the floor while a loose one allows damaging edits.",
    k: ["Badge or short-code login on shared devices vs full credentials: quick login keeps work flowing and weakens identity, full credentials are secure and slow.", "Role-based permissions vs per-user grants: roles are manageable and coarse, per-user is precise and unmanageable at scale."],
    p: ["A shared login makes performance and audit data meaningless.", "Permissions never removed after a job change accumulate into broad access."],
    v: "Log in as a picker and as a supervisor: the picker cannot open adjustments or rule screens, the supervisor can but needs approval over the limit, and every attempt is logged with the user.",
    dep: ["transactional-store","audit-trail","multi-site-tenancy"]
  },
  "multi-site-tenancy": {
    s: "Lets one installation serve many buildings, companies or clients, with separate data, rules and users, and shared reference data where appropriate.",
    d: "Site and owner identifiers appear in every record, and permissions and rules are scoped by them. Central administration handles shared item catalogs and users, while sites run independently. Deployments may be one shared system or per-site instances with sync. It is hard because it forces choices about isolation and failure: a shared system gives one view and one failure domain, separate instances isolate faults and require synchronization of masters.",
    k: ["One central instance for all sites vs an instance per site: central is simple to manage and a network or outage risk, per-site works through WAN loss and needs data sync.", "Strict tenant isolation in code vs separate storage: code is cheaper and a bug can leak, separate storage is stronger and costs more."],
    p: ["A site that depends on a remote instance stops when the link drops.", "A rule meant for one owner applied to every owner by a missing scope."],
    v: "Create two owners in two sites with identical items, and confirm no query, report or API call as one owner returns the other's data, and that cutting a site's WAN link does not stop its floor work.",
    dep: ["transactional-store","access-control","configuration-rules"]
  },
  "audit-trail": {
    s: "A permanent record of who did what and when across data and configuration changes, with before and after values, kept separate from ordinary tables.",
    d: "Every significant change writes an audit row with user, device, time, object, action and values, in the same transaction as the change. The trail supports investigations of lost stock, disputes with customers and compliance reviews. Entries are append-only and protected from edit. It is hard because volume is high, queries over it must still be quick for investigators, and it can only prove what was recorded.",
    k: ["Audit in the same transaction as the change vs asynchronously: same transaction never misses an event and adds latency, asynchronous is fast and can lose entries in a crash.", "Full before-and-after values vs only changed fields: full is easy to read and larger, changed fields are compact and need reconstruction."],
    p: ["Direct database changes by administrators bypass the trail.", "Retention shorter than the dispute window destroys evidence."],
    v: "Change a location's capacity and an item's weight, then query the trail: both entries show user, time and old and new values, and an attempt to modify an audit row fails.",
    dep: ["transactional-store","access-control"]
  },
  "reporting-and-kpis": {
    s: "Standard and ad hoc reports and metrics on throughput, accuracy, inventory and service, produced without slowing the live system.",
    d: "Operational reports read from the transactional store or from a copy, and cover order status, inventory aging, picks per hour, dock turnaround, on-time shipment and inventory accuracy. Metrics are defined once and reused by dashboards, so figures agree. Exports feed the host and analytics systems. It is hard because heavy queries compete with floor transactions, and because metric definitions are contested: what counts as on time, and when the clock starts.",
    k: ["Report from a replica or warehouse vs the live store: replicas protect floor performance and are slightly stale, live is fresh and risks slowdowns.", "Fixed catalog of reports vs self-service queries: fixed is consistent and limited, self-service is flexible and produces conflicting numbers."],
    p: ["Two reports defining on-time differently give managers contradictory answers.", "An unbounded report query during a wave slows scanners."],
    v: "Run the on-time shipment report for a day and recount from raw ship confirmations and promised dates by hand; the figures must match, and the report must run without raising scan response times.",
    dep: ["transactional-store","master-data-cache","job-scheduler"]
  },
  "job-scheduler": {
    s: "Runs recurring and delayed background work, such as wave releases, replenishment checks, count generation, purges and report refreshes, at set times or intervals.",
    d: "Jobs have schedules, dependencies, timeouts and retry policies, and record their runs. The scheduler ensures a job does not run twice at once, even with several servers. Some jobs run per site and time zone. It is hard because background work competes with floor traffic and a failed or hung job silently stops a process, such as an automatic release never firing before cutoff.",
    k: ["Central scheduler with leader election vs jobs scheduled by each node: central avoids duplicates and needs failover, per-node is simple and can double-run.", "Fixed clock times vs event-triggered jobs: clock times are predictable, event triggers react quickly and can storm."],
    p: ["A job that hangs holds a lock and blocks its next run without alerting anyone.", "Daylight-saving shifts cause a nightly job to run twice or not at all."],
    v: "Start two scheduler nodes, and confirm a job set for every minute runs exactly once per minute over an hour, even after killing the active node, and that a failure raises an alert.",
    dep: ["transactional-store","message-queue","configuration-rules"]
  },
  "transactional-store": {
    s: "The database that holds orders, inventory, tasks and configuration, with transactions guaranteeing that related changes commit together or not at all.",
    d: "A relational store holds the ledger, tasks and masters, with constraints and indexes tuned for many small updates by many devices. Transactions bundle a movement with its task and audit entries. Backups, replication and failover protect against loss. It is hard because the workload is dominated by contention on hot rows, such as the stock of a popular item, and because every second of downtime idles hundreds of workers.",
    k: ["One database for all functions vs separate stores for ledger and tasks: one keeps transactions simple and scales as a whole, separate scales parts independently and loses atomic commits.", "Synchronous replication to a standby vs asynchronous: synchronous loses no data on failover and slows writes, asynchronous is fast and can lose last transactions."],
    p: ["Long reporting queries on the primary hold locks and stall scans.", "A failover to a lagging replica loses recently confirmed picks."],
    v: "Kill the primary during a load test of confirmations and confirm failover completes within the recovery objective, and every confirmation acknowledged to a device is present after failover.",
    dep: []
  },
  "inventory-locking": {
    s: "Concurrency control that stops two transactions from taking the same stock at once, using row locks, optimistic versions or per-item queues.",
    d: "Allocation, picks and moves read a balance and change it. To avoid lost updates, the system locks the row, or checks a version, or serializes work for an item through a queue. Hot items attract many concurrent writers, so lock duration must be short and ordering consistent to avoid deadlocks. It is hard because a correct approach for normal items collapses under contention for the fastest sellers during a peak.",
    k: ["Pessimistic row locks vs optimistic version checks: locks are simple and queue writers behind a hot row, optimistic avoids waiting and retries on conflict.", "Lock the item row vs the item-and-location row: item-level is simple and contended, location-level allows parallel work and complicates allocation."],
    p: ["Lock ordering that differs between functions deadlocks allocation and pick confirmations.", "Long transactions that hold locks while calling a carrier make the hot item unavailable for seconds."],
    v: "Run 500 concurrent allocations against one item with 100 units: exactly 100 units are allocated, none twice, no deadlock errors surface, and the p99 latency stays within the stated limit.",
    dep: ["transactional-store"]
  },
  "event-outbox": {
    s: "A durable log of events written in the same transaction as the change, then delivered to other systems, so that updates are never lost and never sent for rolled-back work.",
    d: "When a function changes data, it also inserts an event row, such as shipped or received, in the same transaction. A relay reads unsent rows and publishes them to the message queue or the host, marking them delivered after acknowledgment. Consumers handle duplicates. It is hard because ordering per object matters, retries cause duplicates, and the log grows without bounds unless purged.",
    k: ["Outbox written with the business change vs publish directly after commit: outbox never loses events and adds a relay, direct is simple and can drop events on a crash.", "Strict global ordering vs ordering per order or item: global is easy to reason about and limits throughput, per-key scales and demands careful keys."],
    p: ["Relay stops silently and events accumulate while hosts see no updates.", "Consumers that do not deduplicate apply the same shipment twice."],
    v: "Kill the relay mid-publish and restart: every committed event is delivered at least once, none is delivered for a rolled-back transaction, and consumer deduplication results in single effects.",
    dep: ["transactional-store","message-queue"]
  },
  "message-queue": {
    s: "A broker that carries messages between components and with external systems, with persistence, retries, ordering where needed and dead-letter handling.",
    d: "Producers publish to queues or topics; consumers acknowledge after processing. The broker retains unacknowledged messages, redelivers after timeouts and moves repeatedly failing messages to a dead-letter queue. It decouples spikes in inbound orders from processing speed. It is hard because delivery is at-least-once, so every consumer must be idempotent, and because ordering guarantees and throughput pull in opposite directions.",
    k: ["At-least-once delivery with idempotent consumers vs exactly-once claims: at-least-once is dependable and puts the burden on consumers, exactly-once is convenient and costly or limited.", "One queue per message type vs shared: per type isolates problems, shared is simpler and lets a poison message block others."],
    p: ["A poison message retried forever blocks everything behind it.", "Unbounded queues absorb a stuck consumer's backlog until memory runs out."],
    v: "Send 10,000 messages with a consumer that fails on 10 of them: all valid messages are processed once, the failures arrive in the dead-letter queue with an alert, and queue depth returns to zero.",
    dep: ["transactional-store"]
  },
  "device-connectivity": {
    s: "The sessions between scanners, printers, scales and controllers and the servers: connections, heartbeats, reconnection and message correlation.",
    d: "Handhelds hold persistent sessions over wireless; printers and scales use network sockets; controllers use industrial protocols. A connection layer manages sessions, detects drops by heartbeat, resends unacknowledged messages and tells functions when a device disappears. It keeps a mapping from device to user and station. It is hard because wireless roaming, power saving and congested radios produce brief drops that must not duplicate or lose transactions.",
    k: ["Persistent sessions with server-side state vs stateless requests: sessions give fast screens and require recovery after drops, stateless is resilient and chattier.", "Acknowledge each device message before acting vs after: before is simpler and can lose work on a crash, after is safe and needs idempotent handling."],
    p: ["A device resending a scan after a timeout posts it twice.", "Silent half-open connections leave tasks assigned to a handheld that is already gone."],
    v: "Walk a handheld out of coverage and back mid-task: the session resumes on the same screen, the confirmed scan is posted once, and no scan is lost or repeated.",
    dep: ["message-queue"]
  },
  "master-data-cache": {
    s: "A fast, local copy of rarely changing reference data, such as items, locations and rules, so that screens and scans do not hit the database for each lookup.",
    d: "On startup and on change events, the cache loads items, barcodes, locations, zones and settings into memory in each server, and serves lookups at memory speed. Invalidation arrives through events or versions. Scan validation, which happens thousands of times a minute, depends on it. It is hard because stale data misleads silently: a changed barcode or a closed location keeps working in some servers for minutes.",
    k: ["Cache with event-driven invalidation vs short time-to-live: events are fresh and fail if one is missed, TTL is simple and bounded stale.", "Cache per server vs shared cache: per server is fastest and inconsistent between servers, shared is consistent and an extra hop."],
    p: ["A missed invalidation event leaves one server accepting a retired barcode.", "A cold cache after restart makes every scan slow at once."],
    v: "Change an item's barcode and confirm every server resolves the new code within the stated interval and rejects the old one, and measure scan latency after a restart until the cache is warm.",
    dep: ["transactional-store","event-outbox"]
  },
  "archive-and-purge": {
    s: "Moves old transactions and completed orders out of the live store, keeping it small and fast while preserving history for audits and disputes.",
    d: "Jobs copy completed orders, tasks and transactions older than a retention period to an archive, verify the copy and delete from the live tables in small batches. Some data, such as the audit trail or lot history, has longer retention. The archive remains queryable for investigations. It is hard because deletions at volume lock tables, referential links break when parents are removed before children, and legal retention differs by data type.",
    k: ["Archive to cheaper storage vs delete outright: archive keeps history for disputes and costs storage and tooling, delete is simple and irreversible.", "Purge in small batches continuously vs large batch at night: small batches avoid locks and run forever, large batches are simple and risk long stalls."],
    p: ["A purge run during a wave locks tables and stops scanning.", "Archiving orders without their related lot history breaks a later recall trace."],
    v: "Archive a month of completed orders in a test copy and confirm row counts match across live and archive, queries on live tables speed up, and a recall trace over the archived period still returns complete results.",
    dep: ["transactional-store","audit-trail","job-scheduler"]
  },
});
