// Details for the routing daemon plate, part 3: convergence, route tables, route combination.
ATLAS.details("routing-daemon", {
  "fast-failure-detection": {
    s: "A lightweight, rapid liveness check between two forwarding endpoints that notifies routing protocols within tens of milliseconds of a path failing.",
    d: "Two routers exchange tiny packets at a negotiated interval, such as every 50 milliseconds, and declare the path down after a small number of misses. Routing sessions register with the detector and are told immediately when it fires, instead of waiting for their own hold timers. Detection can run in the forwarding hardware so it is independent of control-plane load. It makes sub-second convergence possible without making protocol timers aggressive. The difficulty is false positives: short intervals mistake brief congestion for failure and cause flaps.",
    k: ["Aggressive detector intervals vs conservative: aggressive intervals cut outage time, but trigger on transient loss and amplify flapping.", "Detection in hardware vs in the daemon: hardware survives control-plane load and requires platform support; daemon-based is portable and subject to scheduling delays."],
    p: ["A detector run by the busy daemon misses its own packet deadline and falsely reports the neighbor down.", "Detector and protocol hold timers misaligned leave the protocol up after the path is down, or the reverse."],
    v: "Set a 50 millisecond interval with three misses, drop traffic on the path in a lab, and confirm the protocol session goes down within about 150 milliseconds, measured from the failure to the event log entry.",
    dep: ["timer-wheel","raw-packet-io","session-state-machine"]
  },
  "interface-event-tracking": {
    s: "Reacts immediately to link up and down notifications from the system, so protocols do not wait for timers to learn that a cable was cut.",
    d: "The system reports interface state changes. The daemon tells each protocol using the interface, which tears down adjacencies and sessions on it, withdraws attached prefixes and triggers recomputation. Carrier loss is detected in milliseconds, much faster than protocol timers. Since a flapping optic generates a storm of events, a hold-down delays reporting up transitions until the link is stable. It is hard to choose delays: too long and recovery is slow, too short and a bouncing link churns the network.",
    k: ["Immediate down, delayed up: failure reaction is fast and a flapping link is slow to be trusted again, a deliberate asymmetry.", "Reacting to interface events vs only protocol timers: events are fast but missed on links that fail silently, like those through a switch."],
    p: ["A link that fails without dropping carrier, such as through an intermediate switch, is not seen until protocol timers expire.", "A flapping link without a hold-down generates a recomputation for each bounce."],
    v: "Unplug a cable on a test router and confirm the adjacency is declared down within tens of milliseconds, the prefixes are withdrawn, and replugging does not restore the adjacency before the hold-down elapses.",
    dep: ["interface-state-feed","neighbor-state-machine"]
  },
  "spf-throttling": {
    s: "Delays and spaces out shortest-path computations after changes, so a burst of advertisements triggers one computation instead of many.",
    d: "After the first change the daemon waits a short initial delay to collect related updates, then computes. If more changes arrive it backs off exponentially up to a maximum, and returns to the short delay after a quiet period. This balances speed in a single failure against stability in a storm. All routers using similar settings is useful because it reduces transient differences in their views. It is hard because the right numbers depend on network size and hardware speed, and the wrong ones lengthen outages.",
    k: ["Exponential backoff vs fixed delay: backoff is fast for an isolated failure and protective in a storm, with three parameters to tune.", "Same timers everywhere vs per-router tuning: consistent timers reduce transient loops; tuning lets a fast router react sooner and risks disagreeing with others."],
    p: ["An initial delay that is too long adds that delay to every single failure in the network.", "Timers that differ between routers lead to transient forwarding loops while one has updated and another has not."],
    v: "Inject a burst of fifty changes within a second in a lab and confirm that only a few computations run, spaced as configured, and the final routes reflect all changes.",
    dep: ["spf-computation","timer-wheel","link-state-database"]
  },
  "update-pacing": {
    s: "Limits how often a router advertises changes about the same prefix to a neighbor, merging rapid changes into fewer updates.",
    d: "A minimum interval between advertisements of the same prefix, or a batching timer, collapses a series of rapid changes into the final state. It prevents sending a route and its withdrawal and replacement in quick succession and reduces churn propagated beyond the origin. The interval differs for internal and external neighbors, with external usually longer. Pacing improves stability, but each interval is added to convergence time. It is hard to tune because the same setting protects against storms and slows legitimate fast changes.",
    k: ["Longer minimum intervals vs shorter: longer reduces global churn, and delays each change by up to that interval at every hop.", "Pacing per prefix vs per neighbor: per prefix is precise and needs more state; per neighbor is simple and delays unrelated changes."],
    p: ["A pacing interval on every hop of a long path adds up to a convergence time of minutes for a single change.", "Disabling pacing during a flapping event spreads the flap to every network that sees the prefix."],
    v: "Flap a prefix every second at the source and confirm the neighbor receives updates no more often than the configured interval, with the final state correct after the flapping stops.",
    dep: ["adj-rib-out","timer-wheel"]
  },
  "route-flap-damping": {
    s: "Suppresses routes that change repeatedly by accumulating a penalty on each flap, withholding the route until the penalty decays.",
    d: "Each withdrawal or change adds a penalty to the prefix. The penalty decays exponentially with a half-life. Above a suppress threshold the route is not used or advertised; below a reuse threshold it returns. This protects the network from a single unstable prefix at the cost of making a stable but recently flapped route unavailable for minutes. Modern practice limits damping to very long thresholds because a wide use delayed legitimate recovery after failures and added little stability.",
    k: ["Damping vs pacing and fast detection: damping punishes recurrently unstable routes strongly but delays recovery of a legitimately recovering route.", "Per-prefix state vs per-neighbor: per prefix targets the offender and costs memory for each tracked prefix."],
    p: ["A route that flaps because of one real incident is suppressed for tens of minutes after it recovers.", "Aggressive default parameters damp stable prefixes during a legitimate event such as a link failure and re-convergence."],
    v: "Flap a test prefix until it crosses the suppress threshold, confirm it disappears from the table, stop flapping, and confirm it returns when the penalty decays below the reuse threshold at the predicted time.",
    dep: ["update-processing","timer-wheel"]
  },
  "graceful-restart": {
    s: "Lets a router restart its routing software while neighbors keep forwarding with its previously advertised routes, avoiding a network-wide reconvergence.",
    d: "Before or at restart, the router signals it supports it and the time it needs. Neighbors keep the routes learned from it, marked stale, while forwarding continues in hardware. When the session returns they exchange routes again, and stale routes not refreshed are removed after an end-of-table marker or a timeout. Helper mode on the neighbor and restart mode on the restarting router are separate. It relies on the forwarding plane remaining intact, and so it makes a control-plane restart invisible only when routing was stable.",
    k: ["Keep forwarding stale routes vs withdraw immediately: stale preserves traffic through a restart, but traffic goes into a black hole if the topology changed meanwhile.", "Restarter and helper roles vs one mode: separate roles allow partial deployment and demand more states and timers."],
    p: ["A topology change during the restart window leaves neighbors forwarding to a path that no longer exists until timers expire.", "Neighbors without helper support withdraw routes at once, so the restart still causes an outage for them."],
    v: "Restart the daemon on a router carrying traffic with helper-capable neighbors and confirm packet loss is near zero, neighbors mark routes stale, and the stale marks clear after the end-of-table marker.",
    dep: ["state-checkpointing","restart-reconciliation","capability-negotiation"]
  },
  "fast-reroute": {
    s: "Precomputes a backup next hop for each destination so forwarding switches to it within milliseconds of a failure, before the protocol reconverges.",
    d: "For each primary path, the daemon computes a loop-free alternate that does not route back through the failing element, or a tunnel to a point that does. The backup is installed in the forwarding table alongside the primary and used instantly when the primary link goes down. Normal reconvergence follows later and replaces it. Not every destination has a safe backup, so coverage depends on topology. The hard parts are guaranteeing loop freedom and installing backups without doubling hardware table use.",
    k: ["Simple alternates vs tunnel-based full coverage: simple alternates need no extra mechanism and cover only some topologies; tunnels cover nearly all at more complexity.", "Per-prefix backup vs shared backup groups: shared groups save table space and need a next-hop group abstraction."],
    p: ["A backup that loops back through the failure creates a micro-loop in the milliseconds between local repair and global update.", "Coverage assumed complete in design is partial in practice, and the uncovered destinations lose traffic until reconvergence."],
    v: "Fail a primary link in a lab with a high-rate stream and confirm the stream shifts to the precomputed backup with loss of a few milliseconds, then moves to the new primary after reconvergence with no further loss.",
    dep: ["spf-computation","next-hop-groups","hardware-offload-programming"]
  },
  "prefix-independent-convergence": {
    s: "Structures forwarding entries so that a failure of one next hop updates a single shared object, not every one of hundreds of thousands of prefixes.",
    d: "Routes point to a shared next-hop object, which in turn refers to the physical path. When a path fails, only that shared object is updated, and every prefix using it switches at once. Without this, convergence time grows with the number of prefixes affected, which is seconds at full-table scale. The structure is created in the forwarding compiler and used by hardware that supports multiple indirection levels. The hard part is detecting which indirection level to share, and keeping them consistent across updates.",
    k: ["Indirection through shared next-hop objects vs direct route entries: failover time stays constant, and hardware needs extra lookup levels and memory.", "Sharing by next hop vs by path set: path-set sharing handles multipath too, with more objects to maintain."],
    p: ["Hardware that does not support indirection gets expanded entries and silently regains the per-prefix convergence cost.", "A shared object updated before its dependents are installed briefly points to nothing."],
    v: "Load a full table with one primary exit, fail the exit, and measure convergence time; confirm it is the same for 10,000 and 900,000 prefixes, unlike a direct-entry configuration.",
    dep: ["next-hop-groups","fib-compiler","hardware-offload-programming"]
  },
  "graceful-shutdown": {
    s: "Signals neighbors to move traffic away from a session or router before taking it down for maintenance, so planned work causes no loss.",
    d: "Before maintenance, the router advertises routes with lower preference using a standard tag, so neighbors choose alternatives, and waits for traffic to drain. Then it shuts the session. Link-state protocols do the same with an overload indication or by raising metrics. Operators automate the procedure into a maintenance mode. It converts failures into planned events, which is far less costly. The challenge is that the drain depends on neighbors honoring the signal, and the operator must verify that traffic is actually gone.",
    k: ["Signal then wait vs shut down directly: draining avoids loss and adds minutes to each maintenance; direct shutdown relies on fast reroute.", "Overload bit vs raising metrics: overload removes the router from transit and keeps its own prefixes; metrics steer gradually and allow partial use."],
    p: ["A neighbor that ignores the signal keeps sending traffic until the session closes.", "Taking down the last alternate path during maintenance leaves no path after the drain."],
    v: "Trigger maintenance mode on a router carrying traffic, confirm neighbors switch to alternate paths and traffic through it falls to zero, and only then shut the session with no packet loss.",
    dep: ["attribute-rewriting","community-matching","adj-rib-out"]
  },
  "protocol-tables": {
    s: "Each protocol keeps its own table of routes it learned, including its own idea of best, before handing them to the central table.",
    d: "A protocol computes best routes by its own rules, such as shortest path or best path, and offers them to the global RIB as candidates tagged with the protocol, metric and next hop. Withdrawals are sent when a route is lost. Keeping them separate keeps each protocol independent and testable, and lets a protocol restart without clearing others. Interfaces between the protocol and the RIB are queues, so protocols do not block on each other. The difficulty is keeping the two views consistent, especially after a restart on either side.",
    k: ["Separate per-protocol tables vs one unified table: separation isolates protocols, and consistency between the tables must be managed.", "Pushing every candidate vs only the protocol best: only best is smaller and loses backups; all candidates feed fast failover and cost memory."],
    p: ["After a protocol restarts, routes it offered earlier remain in the RIB until a timeout, pointing to dead next hops.", "A protocol's best route and the RIB's chosen route disagree, and the operator sees conflicting views."],
    v: "Stop one protocol on a test router and confirm all its routes disappear from the global RIB within the cleanup time, while routes from other protocols for the same prefixes take over.",
    dep: ["module-message-queues","global-rib"]
  },
  "global-rib": {
    s: "The single table that holds the best route per prefix from all sources, and the authoritative input to the forwarding table.",
    d: "For each prefix, candidates from protocols, static configuration and connected networks are compared by trust, then by metric within the same source. The winner is the active route and is sent to forwarding. Others stay as inactive backups so that if the active route disappears, the next takes over immediately. It is a trie keyed by prefix with each node holding its candidate list. It is hard because it is updated by many protocols concurrently, its size reaches millions of prefixes and operations must stay fast.",
    k: ["Keeping inactive routes vs only the winner: kept backups allow instant takeover and use memory; discarding them forces protocols to resend.", "A single global table with route-level locking vs per-instance tables: global is simple to reason about; per-instance partitions allow parallelism."],
    p: ["Contention on one table limits update rate when many protocols converge together.", "A removed route's inactive backup is promoted with a stale next hop that no longer resolves."],
    v: "Offer the same prefix from three sources and confirm the winner is the most trusted; withdraw it and confirm the next takes over within the budgeted time, and that the forwarding table changed accordingly.",
    dep: ["protocol-tables","administrative-distance","route-memory-pools"]
  },
  "administrative-distance": {
    s: "A configurable trust ranking among route sources, used to pick between routes to the same prefix from different protocols or from static configuration.",
    d: "Metrics from different protocols are not comparable, so each source has a distance and lower wins. Connected routes beat static, which usually beat dynamic ones from trusted protocols, and those beat less trusted ones. An operator can change the distances, for example to make a static route a floating backup that applies only when a dynamic route vanishes. The danger is mixing protocols whose distance ordering creates a loop between two redistributing routers, each preferring the other's version.",
    k: ["Fixed trust order vs per-route override: fixed is predictable; overrides allow backups and migrations and make the effective order depend on configuration.", "Comparing by distance first vs metric first: distance first is the convention; metric first has no cross-protocol meaning."],
    p: ["Two routers redistributing between protocols with preferences that favor the other's copy create a loop and oscillate.", "A floating static route with a distance lower than intended hides a good dynamic route."],
    v: "Configure a floating static route with a higher distance than the dynamic route, confirm the dynamic route is active, remove the dynamic route, and confirm the static becomes active and returns to dormant when the dynamic route returns.",
    dep: ["global-rib"]
  },
  "next-hop-resolution": {
    s: "Finds the actual directly connected interface and neighbor for a route whose next hop is an address several hops away, by looking it up in the table recursively.",
    d: "A route learned from a distant router names a next hop that is not directly connected, such as another router's loopback. The RIB looks up that address, which gives either a direct next hop or another route, and repeats until reaching a connected one. The result decides whether the route is usable and its forwarding path, and a metric to that next hop feeds best-path selection. Resolution through a default route or through the same prefix must be forbidden to avoid loops. It is hard because every change to the underlying route re-resolves all dependent ones.",
    k: ["Recursive resolution vs requiring directly connected next hops: recursion allows a stable overlay on top of changing underlay paths, at the cost of dependency tracking.", "Allowing resolution via a default route vs forbidding it: allowing is convenient and hides real reachability loss; forbidding is safer."],
    p: ["A route resolved through a covering prefix that depends on itself loops and flaps.", "Resolution through a default route keeps a route active after the real next hop is gone."],
    v: "Install a route with a next hop three hops away, confirm the RIB shows the resolved interface, then withdraw the underlying path and confirm the dependent route is marked unresolved and removed from forwarding.",
    dep: ["global-rib","next-hop-tracking"]
  },
  "next-hop-tracking": {
    s: "Watches each next hop that routes depend on, and notifies those routes when its reachability or metric changes, instead of polling or waiting for scans.",
    d: "Protocols register next-hop addresses with the RIB. The RIB resolves each, and when the underlying route changes, it notifies the registered protocols, which reevaluate dependent routes immediately. Older designs scanned all routes on a timer, up to a minute, so changes were slow. Registration is coalesced so many routes sharing one next hop cause one watch. Notifications are rate limited to avoid storms when an underlying link flaps. The hard part is dependency bookkeeping at the scale of hundreds of thousands of routes.",
    k: ["Event-driven tracking vs periodic scanning: event-driven reacts in milliseconds and needs dependency state; scanning is stateless and slow.", "Immediate notification vs dampened: immediate is fast; dampening protects against churn from flapping next hops."],
    p: ["Without it, a next hop failure is noticed only at the next scan, leaving traffic black-holed for tens of seconds.", "A flapping next hop triggers repeated mass reevaluation of every route that depends on it."],
    v: "Fail the path to a next hop used by 200,000 routes and confirm all dependent routes are updated within the configured notification delay, not at a periodic scan, using the event log timestamps.",
    dep: ["global-rib","module-message-queues"]
  },
  "virtual-routing-instances": {
    s: "Separate routing tables and protocol instances on one router, so different customers or functions can reuse addresses and never see each other's routes.",
    d: "Each instance has its own RIB, forwarding table, interfaces and protocol sessions. Traffic arriving on an interface is looked up only in that interface's instance. Instances can run their own protocols with different neighbors. Selected routes can be leaked between them by policy. They serve customer separation, management networks and overlapping address space. The challenges are resource accounting per instance, since one instance with a huge table can starve others, and ensuring that no operation or inspection mixes tables.",
    k: ["Full instances with separate protocol processes vs lightweight tables in one process: full gives isolation and failure containment, with more overhead; tables are cheap and share a fate.", "Strict isolation vs controlled leaking: strict is safe, and many real designs need shared services reachable from every instance."],
    p: ["A command defaulting to the global instance reads or changes the wrong table.", "One customer instance consuming memory starves all others if limits are absent."],
    v: "Configure two instances with the same prefix pointing to different next hops, send traffic into each, and confirm each follows its own table, and that neither instance's routes are visible in the other.",
    dep: ["global-rib","interface-state-feed","fib-compiler"]
  },
  "static-routes": {
    s: "Manually configured routes that enter the RIB without a protocol, used for simple networks, defaults, and backups, optionally tied to a tracked condition.",
    d: "A static route names a prefix and a next hop or interface, with an optional distance and tag. It is installed while its next hop is reachable. Tracking can make it conditional on a probe, so a static default is removed when the upstream stops answering. Static routes can be redistributed into protocols. They are simple and a risk: they do not react to topology changes unless tracked, and they remain in configuration long after people forget why.",
    k: ["Static routes with tracking vs dynamic protocol: tracking gives dynamic behavior without a protocol and only detects what it probes; a protocol discovers actual topology.", "Next hop address vs outgoing interface: the address resolves recursively and survives interface changes; interface-only suits point-to-point and misbehaves on shared links."],
    p: ["A forgotten static default remains active after the real path fails and black-holes traffic.", "A static route to an interface on a shared segment makes the router resolve every destination as directly attached."],
    v: "Add a static route with a tracked next hop, confirm it is active, make the next hop unreachable and confirm the route leaves the RIB, and returns when the next hop recovers.",
    dep: ["global-rib","next-hop-resolution"]
  },
  "route-metadata": {
    s: "Extra fields carried with a route in the RIB, such as tags, source, installation time and policy marks, used for filtering, redistribution and explanation.",
    d: "Besides prefix and next hop, routes carry a numeric tag, the originating protocol, an age, the neighbor it came from and any marks set by policy. Tags survive redistribution between protocols, so they can label routes and prevent them from being re-injected where they came from. Metadata gives inspection its provenance and lets policy express intent. The difficulty is that tags are a numeric convention shared by all operators of a network and are easily reused for two meanings.",
    k: ["Tags to prevent redistribution loops vs relying on topology: tags are explicit and robust, but need a numbering plan.", "Rich metadata in every route vs a minimal route object: rich data improves explanation and uses more memory per route."],
    p: ["Two teams use the same tag value for different purposes, and a filter drops the wrong routes.", "Metadata lost when a route passes through a protocol that cannot carry it breaks loop prevention."],
    v: "Tag routes on redistribution from one protocol, filter on the tag when redistributing back, and confirm no route is re-injected into its origin while untagged routes pass.",
    dep: ["global-rib","route-maps"]
  },
  "redistribution": {
    s: "Takes routes from one protocol or source and injects them into another, translating metrics and attributes, so separate routing domains can reach each other.",
    d: "A router running two protocols can export the best routes of one into the other, with a policy to select them, a default metric, and tags. Because each protocol has its own metric scale and rules, the translation loses information. Doing it at several points creates loops and suboptimal paths, so designs use one-way redistribution, tags and distance changes. It is common in mergers and migrations and between internal and external protocols. It is hard to do safely because small policy errors leak routes in both directions.",
    k: ["Redistribution vs running one protocol across both domains: redistribution allows independence and migration; one protocol gives consistent metrics and requires a merge.", "Redistributing everything vs only summaries: everything is complete and floods the target protocol; summaries are small and hide detail."],
    p: ["Mutual redistribution at two points creates a loop because each router re-exports the other's routes with a better distance.", "Redistributing a full internet table into a link-state protocol floods every router and exhausts memory."],
    v: "Redistribute from one protocol to another in a lab with tags and confirm only intended routes appear in the target with the translated metric, and that none reappear in the source after reverse redistribution.",
    dep: ["global-rib","route-maps","route-metadata"]
  },
  "route-aggregation": {
    s: "Combines several specific routes into one covering route for advertisement, reducing table size and hiding internal instability.",
    d: "The daemon creates an aggregate when at least one more-specific route exists, and advertises it with merged attributes, while optionally suppressing the more-specifics. The aggregate may combine the path information from components, with a marker that information was lost. Aggregates are also anchors that point to a discard route so unreachable parts are dropped, not looped. It is hard because the aggregate hides failures inside it: traffic keeps arriving though only part of the block is reachable.",
    k: ["Suppressing more-specifics vs advertising both: suppression shrinks tables and hides traffic engineering options; both keep detail and the size.", "Aggregate only while components exist vs always: conditional follows reality and flaps with the components; always is stable and attracts traffic for dead blocks."],
    p: ["An aggregate with a discard route attracts traffic for unreachable addresses and silently drops it.", "Merged path information produces a path with a loop-prevention gap, since original path segments are no longer visible."],
    v: "Create an aggregate over four components, confirm one covering route is advertised, withdraw all components and confirm the aggregate is withdrawn, and a discard route handles traffic to the gaps before then.",
    dep: ["global-rib","path-attributes"]
  },
  "multipath-computation": {
    s: "Decides which of several equally good routes to use together, for load sharing, and produces the set of next hops for forwarding.",
    d: "When several candidates tie on the main criteria, or are configured as acceptable together, the daemon keeps all of them as next hops with weights. For link-state, equal-cost paths come from the shortest-path computation. For path-vector, selection steps compare only up to a configured point, such as path length, and allow different paths from different neighbors. The forwarding plane spreads flows across them. It is hard because uneven weights, paths with different capacity, and later failure of one path need coordinated updates.",
    k: ["Equal-cost only vs unequal-cost weighted: equal-cost is simple and wastes uneven capacity; weights use it and require hardware and bandwidth information.", "Relaxed comparison in path-vector selection vs strict single best: relaxed uses more paths and makes the choice less deterministic."],
    p: ["Using paths with very different latency in one flow set causes reordering and poor throughput.", "A multipath set that silently shrinks to one next hop concentrates traffic on a link that is not sized for it."],
    v: "Offer four equal-cost paths, confirm four next hops are installed, send many flows and confirm that traffic is spread approximately evenly, then fail one path and confirm the remaining three share it.",
    dep: ["best-path-selection","spf-computation","next-hop-groups"]
  },
  "default-route-origination": {
    s: "Creates and advertises a default route, often conditionally on having a working upstream, so downstream routers can send unknown traffic toward the exit.",
    d: "The daemon advertises a default route into a protocol, either always or only when the router has a default or specified route of its own. Conditional origination avoids attracting traffic when the upstream is down. Metrics and type let downstream routers choose among several exits. Stub areas and edge neighbors commonly receive only a default. It is simple and a source of black holes when the condition is not tied to real reachability.",
    k: ["Unconditional vs conditional origination: unconditional is stable and attracts traffic without an upstream; conditional follows reality and can flap with its condition.", "A default only vs a default plus selected specifics: default only is smallest; specifics improve exit choice and grow tables."],
    p: ["A router advertises a default after losing its upstream because the condition checks a stale route.", "Two default origins with equal metric balance traffic unintentionally across unequal exits."],
    v: "Advertise a default conditional on a tracked upstream route, remove the upstream and confirm the default is withdrawn from all downstream neighbors within seconds.",
    dep: ["global-rib","conditional-advertisement"]
  },
  "conditional-advertisement": {
    s: "Advertises or withholds a route depending on whether another route exists in the table, enabling controlled backup and failover behavior.",
    d: "The daemon evaluates a condition, such as the presence or absence of a given prefix, and based on it advertises or suppresses a set of routes to a neighbor. A common use is advertising a backup path only when the primary route has disappeared. The condition is checked on changes to the RIB. It adds dynamic behavior and hidden dependencies between routes. It is hard to reason about: the router's advertisements now depend on unrelated routes learned elsewhere, and the test coverage for each condition is easy to miss.",
    k: ["Conditional backup advertisement vs advertising both with different preference: conditional keeps the backup out of tables, and relies on the condition being accurate.", "Condition on exact route vs on any covering route: exact is precise; covering is easily satisfied by a default."],
    p: ["A condition that matches a default route is always true, so the backup is never advertised.", "A condition tied to a route that flaps makes the advertisement flap in turn."],
    v: "Configure advertising prefix B only if prefix A is absent; confirm B is withheld while A is present, withdrawn A and confirm B is sent, then restore A and confirm B is withdrawn.",
    dep: ["global-rib","adj-rib-out"]
  },
  "route-leaking": {
    s: "Copies selected routes from one routing instance or table into another by policy, so isolated networks can reach shared services.",
    d: "Policy selects routes in a source instance and imports them into a target, with the next hop resolved in the source, so traffic crosses between instances. Typical uses are a shared services network reachable from many customer instances, or a management network. Leaks are one-way unless configured both ways, and overlapping addresses must be avoided. Misconfigured leaks collapse the isolation that virtual instances exist to provide, and can cause asymmetric routing where the return path does not exist.",
    k: ["Leaking selected prefixes vs a shared instance everyone attaches to: leaking is flexible and has many policies to audit; a shared instance is explicit but needs a hub design.", "Importing by tag or community vs by prefix: tags scale and rely on discipline; prefix lists are explicit and large."],
    p: ["A broad leak makes one customer's routes visible to another, a security incident.", "Leaking in one direction only gives traffic a path in and no path back."],
    v: "Leak one shared-service prefix into two customer instances, confirm each can reach it, and confirm that neither customer's own prefixes appear in the other instance's table.",
    dep: ["virtual-routing-instances","route-maps","next-hop-resolution"]
  }
});
