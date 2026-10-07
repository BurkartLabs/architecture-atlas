// Details, part 3: authority, replication, anti-cheat.
ATLAS.details("multiplayer-netcode", {
  "server-authoritative-model": {
    s: "One server runs the real simulation and decides every outcome; clients send only intent and display what the server tells them.",
    d: "Clients submit inputs, never results. The server validates and simulates them, and replicates the resulting state to everyone. Whatever a modified client believes, the server's version is the truth, so this is the basis of cheat resistance. It also gives one consistent world with no arbitration between peers. The costs are that every action is delayed by a round trip unless predicted, the server needs enough CPU for the whole match, and prediction and compensation machinery is needed to hide latency. Most competitive games use it.",
    k: ["Server authority vs client trust: cheat resistance and consistency, but latency must be hidden with prediction and the server pays for all simulation.", "Authority over everything vs selective relaxation for cosmetics: strongest guarantees, but needs more server work for details no one would cheat."],
    p: ["Letting one convenient client-authoritative exception, such as a position, quietly become the main cheat vector.", "Server logic that is correct but too slow to simulate every player makes the match fall behind under load."],
    v: "Modify a client to claim a speed, a position and a damage result. Confirm the server ignores all three, keeps simulating from inputs only, and logs each violation against the player.",
    dep: ["server-side-validation", "entity-replication"]
  },
  "client-authoritative-model": {
    s: "Each client simulates its own player and tells others the result, which gives instant response and a trivial server, at the cost of trusting every client.",
    d: "The owning client decides its movement and sometimes its hits, and sends the results to the server, which relays them. There is no prediction or reconciliation because the owner is never corrected. It is easy to build and feels perfect to the owner regardless of latency. It suits cooperative games, low-stakes games and prototypes. With any competitive stake, it invites cheating: speed, teleport and damage claims are accepted. Servers may add sanity limits as a partial defense, but each limit is a fresh guess at what cheating looks like.",
    k: ["Client authority vs server authority: no latency for the owner and a trivial server, but any modified client can lie about anything it owns.", "Pure client trust vs sanity-checked client claims: cheap and responsive, but limits must be tuned so cheaters stay inside them and honest players are not rejected."],
    p: ["Starting with client authority for a prototype and shipping with it leaves a design that cannot be secured without rewriting movement.", "Trusting a client's report of its own health or inventory is an open invitation to edit it."],
    v: "Send an impossible position change from a test client and observe what other clients show. The result shows exactly which claims the build trusts, and whether any limit catches it.",
    dep: ["entity-replication"]
  },
  "distributed-authority": {
    s: "Authority over each object is assigned to a different machine, usually its nearest or most interested player, with the group agreeing on who currently holds it.",
    d: "No single server is the truth for all objects. Each player owns the objects they interact with, and changes are broadcast. A coordinating service tracks ownership, and ownership can move as players pick up and throw objects. It removes the need for a dedicated simulation server, so is attractive for cooperative and small-scale games, and gives low latency for owned objects. Conflicts arise when two players act on the same object at once, and cheating is possible by any owner. Disconnects require the authority to be reassigned.",
    k: ["Distributed ownership vs a central server: no dedicated hosting cost and low latency on owned objects, but cheating returns and conflicting actions need rules.", "Ownership assigned by proximity vs by last interaction: tracks relevance automatically, but ownership can bounce between players near a shared object."],
    p: ["Two players grabbing an object at once both think they own it, and the object duplicates or tears.", "An owner leaving mid-action with no handover freezes the object they were holding."],
    v: "Have two clients grab the same object on the same tick. Confirm exactly one wins by a documented rule, the loser's state is corrected, and ownership is identical on every machine afterward.",
    dep: ["ownership-transfer", "network-identity"]
  },
  "ownership-transfer": {
    s: "Moves authority over an object from one machine to another, with a defined handover so that no updates are lost, doubled or accepted from the old owner.",
    d: "A transfer is requested by a player or decided by the server, for instance when a player picks up a vehicle. The current authority stops simulating, sends its final state with a transfer epoch, and the new owner begins from it. Updates stamped with an older epoch are ignored. The server records who owns each object, so late joiners and reconnecting clients see the right owner. Hard cases are transfer during latency, where the new owner starts from stale data, and requests that cross in flight.",
    k: ["Epoch-numbered transfers vs best-effort handoff: late updates from the old owner are rejected cleanly, at the cost of an additional counter on each replicated object.", "Server-mediated transfer vs direct peer handoff: one source of truth for who owns what, but an extra round trip for every grab."],
    p: ["Accepting a late update from the previous owner snaps the object back to where it was before the transfer.", "Forgetting to release authority when an owner disconnects leaves objects that nobody simulates."],
    v: "Transfer a moving object between two clients at 100 ms latency. Confirm the object's path is continuous, no stale update from the old owner is applied, and every client agrees on the new owner.",
    dep: ["network-identity", "server-authoritative-model"]
  },
  "network-identity": {
    s: "A compact identifier for each networked object, agreed by all machines, so messages can refer to the same entity regardless of local memory addresses.",
    d: "Machines cannot share pointers, so each replicated object gets a small integer, assigned by the authority at spawn. Messages and snapshots refer to entities through it. Identifiers are recycled with a generation counter so that a late message about a destroyed object cannot affect a new one that reused the number. Static scene objects get stable ids derived from the level. References between objects, such as a weapon's owner, are sent as identifiers and resolved on receipt, and may refer to objects that have not arrived yet.",
    k: ["Small integer ids with generation counters vs wide unique ids: compact on the wire and fast to look up, but recycling needs care to avoid stale references.", "Server-assigned ids vs client-proposed: no collisions and simple validation, but a client cannot refer to an object it spawned until the server confirms."],
    p: ["Reusing an id without a generation counter lets a late message modify a different, newer object.", "A reference to an entity not yet received is dropped, and the link is never restored."],
    v: "Destroy and respawn objects rapidly while delayed updates arrive. Confirm no update is applied to a newer entity sharing the number, and that early references resolve when their target arrives.",
    dep: ["server-authoritative-model"]
  },
  "object-spawning": {
    s: "Creates and destroys networked objects on every client in step with the authority, with initial state delivered together with the creation message.",
    d: "When the server creates a replicated object, it tells relevant clients which prefab or type to instantiate, with its identifier, owner and initial property values, so that the object is complete on its first frame. Destruction is sent as a message too, and relevancy changes cause spawn and despawn on a client as objects enter and leave interest. Spawn messages need to be reliable and ordered with respect to updates, or a property update can arrive for an object that does not yet exist. Late-joining clients receive spawns for everything that already exists.",
    k: ["Initial state inside the spawn message vs a separate update: the object is correct on its first frame, but spawn messages become larger and variable.", "Spawn through relevancy vs a global spawn: clients only hold what they need, but objects constantly appear and disappear at the edge of interest."],
    p: ["An update arriving before the spawn is dropped, and the object appears with default values.", "Spawning thousands of objects in one tick overflows the reliable channel and stalls late-joining clients."],
    v: "Join a match in progress with 2,000 entities. Confirm the client finishes loading within the target time, with every object matching the server's state, and none are duplicated.",
    dep: ["network-identity", "reliable-ordered-channel", "entity-replication"]
  },
  "entity-replication": {
    s: "Keeps copies of selected server objects on clients up to date by sending their changing state, using the snapshot or event model per object type.",
    d: "Each replicated entity has a description of which properties are synchronized, how they are quantized, how often they update, and which clients receive them. The replication system tracks per-client what has been sent, and transmits changes with the priority and budget rules. Continuous state such as position is sent in snapshots, while discrete events are sent reliably. Entities have roles: simulated locally with prediction for the owner, interpolated for others. It is the bridge between game code and the wire format, and its API shapes how easy the game is to write.",
    k: ["State replication vs sending events: late joiners and lost packets heal automatically from state, but transient events can be missed unless sent separately.", "Per-property change tracking vs whole-object resend: far less bandwidth, but each write must be intercepted or compared."],
    p: ["Replicating derived data that clients can compute spends bandwidth for nothing and risks inconsistency.", "Per-frame change detection across thousands of entities consumes more CPU than the networking it saves."],
    v: "Change one property on one entity among 5,000. Confirm exactly that property is transmitted to exactly the relevant clients, and the bytes sent match the schema's size for it.",
    dep: ["property-replication", "network-identity", "snapshot-generation"]
  },
  "property-replication": {
    s: "Declares which fields of an object are sent, with their encoding, condition and update frequency, and detects when each has changed since the client last confirmed it.",
    d: "Fields are marked as replicated with attributes such as quantization, an update condition (owner only, initial only, everyone) and a callback to run on change. Each client's last acknowledged values are compared with current ones, usually through dirty bits or periodic comparison. Only changed fields are written, preceded by a field mask. Conditions keep private information away from other players and save bandwidth. Callbacks let the client react, for example by playing an effect when health drops. Correct callback ordering is hard: several fields may change in one update and depend on each other.",
    k: ["Dirty bits set on write vs comparison against a shadow copy: cheap to check, but requires every write to go through an accessor, while comparison works with plain fields at a CPU cost.", "Callbacks per field vs one callback per update: precise reactions, but intermediate states may be observed in odd combinations."],
    p: ["Marking a field as replicated for everyone leaks private data such as an enemy's inventory to every client.", "A change callback that assumes another field already arrived reads a stale value."],
    v: "Change three fields in one tick on an entity with one private field. Confirm the owner receives all three and others receive two, and each callback runs once after all three apply.",
    dep: ["bit-packing", "schema-definition"]
  },
  "replication-priority": {
    s: "Ranks pending updates so the most important ones are sent first within the bandwidth budget, with unsent entities gaining urgency until they get through.",
    d: "Each entity has a priority per client that grows every tick it is not sent, scaled by factors such as distance, whether it is in view, recent change, and gameplay importance such as being the player's target. When building a packet, the replicator sorts by accumulated priority, sends from the top until the budget is full, and resets those entities. Entities left behind keep accumulating, so no entity is starved indefinitely. This degrades gracefully under limited bandwidth, by distant entities updating less often. Tuning the weights is a gameplay decision as much as a technical one.",
    k: ["Accumulated priority vs fixed frequency per class: adapts to load automatically with no starvation, but update rates become variable and harder to reason about.", "Distance-weighted vs view-weighted priority: favors nearby threats, but objects behind the player may jump when they turn into view."],
    p: ["Priority that resets even when the update was not sent starves distant entities permanently.", "Sorting all entities per client each tick costs more CPU than the bandwidth savings are worth at high counts."],
    v: "Constrain bandwidth to half of demand in a crowded scene. Confirm nearby and targeted entities keep full update rate, distant ones slow but never stop, and no entity goes unsent beyond its bound.",
    dep: ["entity-replication", "bandwidth-budget"]
  },
  "interest-management": {
    s: "Decides, for each client, which entities it should know about at all, so the server sends and the client holds only what could matter to that player.",
    d: "Sending the whole world to every player scales as players times entities, and gives cheaters a complete map. Interest management computes a relevant set per client, using spatial proximity, team membership, line of sight or game rules, and sends only those entities. Changes in the set cause spawns and despawns. It is the main lever for scaling player counts and also the main information-hiding tool. The difficulty is choosing sets large enough that nothing important pops in late, and cheap enough to evaluate per client every tick.",
    k: ["Aggressive culling vs generous sets: saves the most bandwidth and hides information, but entities pop in visibly if the radius is too small.", "Per-tick recomputation vs updating on movement events: always accurate, but costly at scale, while event-driven is cheaper but can lag behind."],
    p: ["A relevance radius smaller than weapon range makes players get shot by things that were never shown to them.", "A sudden large change in the relevant set creates a spike of spawn messages that overflows the budget."],
    v: "Move a player through a dense area and log relevant-set size per tick. Confirm bandwidth tracks the set, no entity within combat range is ever absent, and spawn spikes stay within budget.",
    dep: ["area-of-interest-grid", "relevancy-rules", "entity-replication"]
  },
  "area-of-interest-grid": {
    s: "A spatial grid or hierarchy that groups entities by location so the set near a player can be found by looking up a few cells instead of scanning every entity.",
    d: "The world is divided into cells, and each entity registers in the cell it occupies. A client's area of interest is the block of cells around its position, so the candidate entities come from a handful of cell lists, updated incrementally as entities move across boundaries. Cell size is tuned to the interest radius. Hierarchical or hashed grids handle large sparse worlds. It makes interest management cost proportional to local density, not to world size, and also gives broad-phase queries for lag compensation.",
    k: ["Uniform grid vs hierarchical tree: trivial and fast to update, but wasteful for very uneven worlds where a tree adapts to density.", "Cell size near the radius vs smaller: few cells per query, but many candidates to filter, while small cells give tighter sets and more lookups."],
    p: ["Updating cell membership only every few ticks leaves fast entities in the wrong cell, so they are missing from interest.", "A hot spot where hundreds of entities share a cell makes lookups there as slow as a full scan."],
    v: "Populate a large world with 10,000 entities. Confirm the per-client query touches only the neighboring cells, and that results match a brute-force distance scan exactly.",
    dep: []
  },
  "relevancy-rules": {
    s: "Game-specific conditions layered over distance that include or exclude entities for a client, such as team visibility, line of sight, always-relevant objects and private data.",
    d: "Spatial proximity is only the starting point. Rules mark some entities always relevant, such as match state, others relevant only to their owner, such as a personal inventory, and others to teammates only. Visibility rules, such as line of sight or fog of war, remove entities the player could not see, which is the strongest defense against information cheats. Rules are evaluated per client and cached over a few ticks, since exact checks such as ray casts are expensive. Hysteresis stops entities flickering in and out at the boundary.",
    k: ["Server-side visibility culling vs sending everything and hiding it on the client: defeats wallhacks outright, but costs CPU and risks late pop-in for entities that become visible quickly.", "Cached relevancy over several ticks vs exact each tick: much cheaper, but a visibility change can be noticed late."],
    p: ["Hiding an entity only in rendering still sends its position, so cheating tools can read it from memory.", "No hysteresis at the boundary makes an entity spawn and despawn repeatedly as the player stands at the edge."],
    v: "Place an enemy behind a wall and read the client's received data. Confirm the enemy's position is absent until it is visible, and appears with enough lead time that it does not pop in front of the player.",
    dep: ["interest-management", "area-of-interest-grid"]
  },
  "remote-procedure-calls": {
    s: "Lets game code invoke a function on another machine, with arguments serialized, a direction and permission defined, and a reliability choice per call.",
    d: "An RPC is a message carrying a function id, the target object's network identity and serialized arguments. Direction is part of the declaration: client to server, server to one client, or server to all relevant clients. The receiver checks the sender's right to call it, validates arguments, and runs the function. Reliable RPCs are used for events that must happen, unreliable for cosmetic ones. RPCs suit discrete events better than state, and overuse leads to state that late joiners never receive. They are a common attack surface for malicious clients.",
    k: ["Events as RPCs vs as replicated state changes: RPCs are direct and cheap to write, but are invisible to late joiners and a reconnecting client.", "Reliable for all RPCs vs per-call choice: simple and safe, but cosmetic events then stall behind lost packets."],
    p: ["Server-side handlers that trust RPC arguments, such as a damage amount or target, are directly exploitable.", "An RPC sent before the target object exists on the receiver is silently dropped."],
    v: "Call every client-to-server RPC from a test client with out-of-range arguments and a non-owned target. Confirm each is rejected, the player's violation count rises, and no state changes.",
    dep: ["network-identity", "message-registry", "hostile-input-validation"]
  },
  "server-side-validation": {
    s: "The server checks every client claim against the rules of the game, such as speed, cooldown, line of sight and resources, and rejects or corrects anything impossible.",
    d: "Each command is checked before it affects state: did the movement exceed what the character could do in the elapsed ticks, is the weapon ready, is the target reachable, does the player own what they are using, is this action allowed in the current game phase. Failures are corrected, since the client's local state is overwritten by the server's, and counted. Validation is the only protection that cannot be bypassed by modifying a client, because it runs on a machine the player does not control. Its limit is what rules can express: an aim assistant that stays within physical limits is valid.",
    k: ["Rejecting invalid commands vs clamping them to legal values: clear violation signal, but a lag spike can look like a violation, while clamping is gentler but hides cheating attempts.", "Validating every command vs sampling: complete coverage, but CPU cost grows with commands per second."],
    p: ["Thresholds set so tight that lag spikes trigger them punish honest players with rubber-banding and kicks.", "Validating on the client only, with the server accepting the result, is no validation at all."],
    v: "Send test commands exceeding speed limits, firing before cooldown, and referencing items not owned. Confirm each is rejected or clamped, logged with the reason, and that a lag spike alone triggers none.",
    dep: ["server-authoritative-model", "input-sanity-limits"]
  },
  "input-sanity-limits": {
    s: "Hard bounds on what a single input command or per-second rate of commands may contain, enforced when the command is received, before it touches the simulation.",
    d: "Commands carry values from the client, such as movement axes, view angle change and tick number. Axis values are clamped to unit length, angles to a maximum turn rate, and the tick number to a window around the server's current tick. A client sending many more commands per second than ticks exist is speeding up. Excess commands are discarded, and repeated violation raises a suspicion score. These checks are cheap and catch crude cheats and accidental bugs, but a careful cheater stays inside them.",
    k: ["Clamping silently vs rejecting with penalties: harmless for honest bugs, but gives cheaters no feedback to learn from versus punishing glitches as cheating.", "Fixed limits vs limits derived from game state: simple to implement, but limits must fit the fastest legitimate case, such as a boost, and so are loose."],
    p: ["Allowing arbitrarily many commands per packet lets a client run its character faster than real time.", "Limits fixed to the base movement speed reject every legitimate dash or vehicle ride."],
    v: "Send commands with oversized axes, stale ticks and triple the normal rate. Confirm each is clamped or discarded, the effective simulation speed stays unchanged, and counters record each violation type.",
    dep: ["server-input-buffer", "hostile-input-validation"]
  },
  "state-obfuscation": {
    s: "Withholds, delays or scrambles information the client does not need, so cheating tools that read memory or traffic find nothing worth reading.",
    d: "The strongest approach is not sending hidden state at all: enemy positions behind walls, other players' inventories and unrevealed cards are withheld by relevancy rules. Where something must be sent, such as a player just about to appear, the data can be sent only a short time before it is needed. Weaker measures encrypt values in client memory or randomize layouts, which slows memory-editing tools but cannot stop a determined cheater. The tension is that withholding creates late pop-in, and that any data the client needs to render is data a cheat can read.",
    k: ["Withholding data on the server vs scrambling it on the client: truly unreadable, but needs visibility logic and pop-in tolerance, while scrambling is easy but only delays cheaters.", "Sending a little early vs exactly on time: no pop-in, but hands the cheater a small advance warning."],
    p: ["Obfuscating values in memory while the server still sends the real positions leaves the cheat simply reading the network traffic.", "Aggressive withholding makes fast-moving enemies appear suddenly in front of the player, which looks like lag."],
    v: "Attach a memory and traffic inspector to a client with an enemy behind cover. Confirm no record of that enemy's position exists until the visibility rule releases it, ahead of when the player could see it.",
    dep: ["relevancy-rules"]
  },
  "client-integrity-checks": {
    s: "Software on the player's machine that tries to detect modified game files, injected code and known cheat programs, and reports to the server.",
    d: "Components scan loaded modules, verify file hashes, detect debuggers and look for known cheat signatures, then send attestation to the server, which can refuse tokens to clients that fail. Since the code runs on the machine the player controls, it is an arms race: cheat authors analyze and bypass it. It raises the effort and price of cheating and removes low-effort cheats, and it is most effective combined with server-side checks. It is intrusive, carries privacy and stability costs, and needs constant updates.",
    k: ["Client-side detection vs server-side only: catches whole classes of tools before they act, but is bypassable and carries privacy and stability costs.", "Kernel-level components vs user-level: harder to bypass, but riskier for system stability and more invasive for players."],
    p: ["Treating a client report as trustworthy, when a modified client can simply lie in the attestation.", "False positives that ban players for unrelated software erode trust faster than cheaters do."],
    v: "Run a known test cheat against a build with the checks enabled. Confirm that it is detected, an attestation failure reaches the server, and that a clean machine passes with no reports.",
    dep: ["connection-tokens"]
  },
  "statistical-detection": {
    s: "Analyzes players' recorded behavior for patterns no human produces, such as inhumanly consistent aim or reaction times, to find cheats that obey every rule.",
    d: "The server logs inputs, aim traces and outcomes, and offline analysis compares each player's accuracy, reaction time distribution, snap angles and tracking smoothness against the population. Models, simple thresholds or learned classifiers, flag outliers for review or automated action. It catches aim assistance and similar cheats that validate perfectly, and finds cheats after they are released, from their effects. The difficulty is false positives against skilled players, delayed action so cheaters cannot learn the threshold, and labeled data to train on.",
    k: ["Delayed bans in waves vs immediate: cheaters cannot tell what triggered detection, but honest players suffer cheaters for longer.", "Automatic action vs human review of flags: scales and acts fast, but false positives are costly and appeals needed."],
    p: ["Setting a threshold on raw accuracy bans the best honest players.", "Banning immediately after a new cheat appears reveals exactly which behavior was detected."],
    v: "Feed recorded sessions from a known aim-assist tool and from top honest players. Confirm the tool's sessions are flagged, none of the honest sessions are, and a review queue entry holds the evidence.",
    dep: ["netcode-telemetry", "replay-recording"]
  },
  "report-and-ban-pipeline": {
    s: "Collects player reports and detector flags, assembles evidence, decides on a penalty and enforces it by revoking the credentials used to join matches.",
    d: "Inputs come from in-game reports, statistical flags and integrity failures. Each case gathers the match replay, the logs and prior history. Policy decides whether to warn, restrict or ban, and may batch bans in waves. Enforcement works at the account, device and sometimes hardware level, and is applied by the token issuer so a banned player is refused before reaching any server. Appeals and reversals need the same evidence. The hard parts are evasion by creating new accounts and keeping the process fair at scale.",
    k: ["Account-level vs device-level bans: simple and low-risk, but evaded with a new account, while device bans stop that but can hit shared machines.", "Automated with sampling for review vs full manual review: scales to millions, but needs measured error rates."],
    p: ["Enforcing only in-game leaves a banned account free to enter matchmaking and ruin more matches.", "Discarding the evidence after the ban makes appeals impossible to resolve."],
    v: "Ban a test account and confirm that the next token request is refused, that a connection with an old unexpired token is rejected at the next check, and the case holds replay and logs.",
    dep: ["connection-tokens", "replay-recording", "statistical-detection"]
  },
});
