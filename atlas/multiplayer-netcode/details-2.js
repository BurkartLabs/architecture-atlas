// Details, part 2: simulation clock, input pipeline, snapshots, prediction.
ATLAS.details("multiplayer-netcode", {
  "fixed-simulation-step": {
    s: "Advances gameplay in constant-size steps independent of rendering rate, so every machine computes the same sequence of states from the same inputs.",
    d: "A time accumulator collects real elapsed time, and the simulation runs once per whole step owed, for example sixty times a second, while rendering interpolates between the last two states. Constant steps make physics stable, make tick numbers meaningful as a shared timeline, and let inputs be addressed to a specific tick. Variable steps would make results depend on frame time and diverge between machines. The hard part is bounding catch-up: after a long stall the accumulator holds many steps, and running them all at once freezes the game, the spiral of death.",
    k: ["Fixed step with render interpolation vs variable step: repeatable and network-addressable, but needs an interpolation layer and a catch-up cap.", "Simulating inside the render loop vs a separate simulation thread: simple and cache-friendly, but a slow frame delays input handling and packet sending."],
    p: ["Uncapped catch-up after a hitch runs dozens of steps in one frame, which takes longer and makes the next frame worse.", "Reading wall-clock time inside gameplay code makes the step non-repeatable."],
    v: "Run two machines at 30 and 144 frames per second on the same input trace and confirm that after 1,000 ticks their simulation states match exactly, while rendered motion stays smooth on both.",
    dep: []
  },
  "tick-rate": {
    s: "The number of simulation steps and state updates the server performs each second, which sets the finest resolution of time and the cost of every connected player.",
    d: "A tick rate of 30, 60 or 128 sets the age of the freshest information a client can receive, the granularity of hit detection, and the CPU and bandwidth the server spends per player. The simulation rate and the snapshot send rate are separate: a server may simulate at 60 and send at 20. Higher rates reduce perceived latency up to the limits of the player's own latency and display, but cost proportionally more and magnify any variation in server frame time. Choosing it is a budget decision for the whole title.",
    k: ["High tick rate vs low: fresher state and finer hit timing, but proportionally more server cost, and diminishing returns once network jitter dominates.", "Sending every tick vs a lower send rate: much less bandwidth, but remote entities update less often and interpolation delay grows."],
    p: ["A server that cannot finish its tick in budget under peak load silently runs slower, stretching every timing assumption.", "Raising the tick rate late in development exposes gameplay code with hidden per-tick constants."],
    v: "Load a server to its player cap and confirm each tick completes within its budget at the 99th percentile, with the measured actual tick interval matching the configured one.",
    dep: ["fixed-simulation-step"]
  },
  "clock-synchronization": {
    s: "Estimates the offset between the client's clock and the server's, and the tick the server is currently on, from timestamped round trips.",
    d: "The client sends its local time; the server replies with the server tick and its own timing. From several samples the client estimates round-trip time and the offset, using the lowest-latency samples and discarding outliers, then continuously refines it. The client uses this estimate to know which server tick its input will arrive at and which past tick the snapshots it displays belong to. Hard parts are asymmetric paths, where the one-way delays differ, and clocks drifting at different rates, so the estimate needs constant correction without visible jumps.",
    k: ["Smoothly slewing the clock vs stepping it: no visible time jumps, but slow convergence after a big change such as a network switch.", "Using the minimum-latency sample vs the average: resistant to delay spikes, but biased by the best case of an asymmetric path."],
    p: ["Stepping the local simulation clock on every sample makes tick numbers jump backward and replays inputs twice.", "Assuming symmetrical latency hides a constant error that shows as a fixed offset in hit registration."],
    v: "Inject a 40 ms asymmetric path and 5 ms jitter. Confirm the estimated server tick stays within one tick of ground truth after ten seconds and never moves backward.",
    dep: ["rtt-estimation", "tick-rate"]
  },
  "tick-alignment": {
    s: "Keeps the client running far enough ahead of the server that each input arrives just before the tick it is meant for, and adjusts that lead as latency changes.",
    d: "A predicting client runs its local ticks ahead of the server by about half the round-trip time plus a small safety margin, and stamps each input with its intended server tick. The server reports how early or late inputs arrived, and the client speeds up or slows down its tick rate slightly to stay on target. Too little lead and inputs arrive late and are discarded or applied out of place; too much and the player pays extra input delay. The margin absorbs jitter, and tuning it is a trade between responsiveness and missed inputs.",
    k: ["Server feedback on arrival margin vs open-loop estimation: converges on the true requirement, but needs a return channel and a controller that does not oscillate.", "Larger safety margin vs smaller: fewer late inputs under jitter, but a constant extra delay for every player."],
    p: ["Adjusting client speed by large steps causes visible stutter and makes the controller oscillate around the target.", "Ignoring late-input reports means a player with jitter silently loses inputs and blames the game."],
    v: "Vary link delay between 30 and 120 ms during a match. Confirm the late-input rate at the server stays below 1% and the client's lead tracks the change within a few seconds.",
    dep: ["clock-synchronization", "server-input-buffer"]
  },
  "time-dilation": {
    s: "Slightly speeds up or slows down the simulation clock on a client or the whole match to stay in sync, instead of snapping to a new time.",
    d: "When a client falls behind or runs ahead, a small rate change of a few percent closes the gap over a second or two, below what players notice. Lockstep and rollback systems use it so a machine that is a few frames ahead slows to let the peer catch up, which reduces the number of rollback frames. Servers may slow the game under overload instead of dropping ticks. Large rate changes become visible as slow-motion or fast-forward, and effects tied to wall time, such as audio, need care.",
    k: ["Gradual rate change vs an instant jump: invisible when small, but too slow for large gaps, which then need a resynchronization.", "Dilating the whole match vs per client: everyone sees the same pace, but one slow player slows all, as in some lockstep games."],
    p: ["Audio and animation left on real time drift against the dilated simulation and become audibly off.", "Dilation that never converges, because the source of the gap is persistent, quietly hides a real problem."],
    v: "Start two peers four frames apart and confirm they converge within three seconds using a rate change under 5%, with no visible jump in motion on either screen.",
    dep: ["fixed-simulation-step", "clock-synchronization"]
  },
  "input-collection": {
    s: "Samples the player's controls once per simulation tick into a compact command, timestamped with the tick it applies to and sent to wherever it will be simulated.",
    d: "Raw device events are reduced to a small command structure per tick: movement axes, buttons, view angles, and the tick number. The same structure feeds local prediction and the network, so both see identical input. Sampling at the tick boundary, not mid-frame, avoids ordering ambiguity. If a frame runs two ticks, each gets its own sample or the same held state. Commands are quantized before use locally, so local prediction uses exactly what the server will receive. Sampling at lower than render rate costs responsiveness; at higher rate it adds nothing.",
    k: ["Sampling per tick vs per frame: matches the simulation exactly, but a 30 Hz tick makes controls feel coarser than a 144 Hz display allows.", "Sending state per tick vs sending events: states are loss tolerant and simple, but short taps between ticks can be missed."],
    p: ["Using full-precision view angles locally and quantized ones on the wire causes systematic aiming errors in reconciliation.", "Reading input at frame time, not tick time, makes the same action land on different ticks between runs."],
    v: "Record a play session's inputs and replay it through the server. Confirm that the final state matches the locally predicted state, to the bit, with no reconciliation corrections.",
    dep: ["fixed-simulation-step"]
  },
  "input-redundancy": {
    s: "Includes the last several ticks of input in every packet so a lost packet's commands are recovered from the next one, without retransmission delay.",
    d: "Inputs are small, a few bytes per tick, while the cost of losing one is a mispredicted or missed action. Each packet therefore carries the current command plus the previous three to five, delta-coded against each other. If a packet is lost, the next one repairs the gap with no waiting for a timeout and no head-of-line blocking. The server discards commands it has already processed. Redundancy depth is set by observed loss, and may adapt. This is unreliable delivery with a statistical guarantee, rather than the explicit guarantee of a reliable channel.",
    k: ["Redundant inputs in every packet vs reliable retransmission: no recovery delay and no stall, but constant extra bytes and a hard limit if several packets in a row are lost.", "Fixed depth vs loss-adaptive depth: simpler, but wasteful on clean links and insufficient on bad ones."],
    p: ["Redundancy depth shorter than a burst of losses leaves permanent gaps the server fills with guesses.", "Applying redundant commands twice on the server because duplicates were not filtered by tick."],
    v: "Drop two consecutive packets in a test link and confirm the server's input stream for that client has no gaps, with each tick's command applied exactly once.",
    dep: ["input-collection", "unreliable-channel"]
  },
  "server-input-buffer": {
    s: "A small queue per client that holds received inputs until their tick, absorbing arrival jitter so the server applies a steady stream of one command per tick.",
    d: "Inputs from a client arrive in bursts and gaps; the server keeps them in order by tick and applies one per simulation step. A buffer depth of one or two ticks covers jitter at the price of a little delay. If the buffer runs empty, the server repeats the last input, or applies a neutral input, and counts the miss. If it grows large, the server discards the oldest to prevent a client from building up latency or saving up actions. The depth is often adjusted by feedback to the client's tick alignment.",
    k: ["Deeper buffer vs shallower: fewer starved ticks under jitter, but more latency from action to effect.", "Repeating the last input on starvation vs applying nothing: movement stays smooth, but a held fire button can keep firing with no player behind it."],
    p: ["An unbounded buffer lets a client queue inputs and release them in a burst, which gives a speed advantage.", "Applying inputs on arrival, not by their tick, makes the result depend on network jitter."],
    v: "Feed a client's inputs with 50 ms of jitter and confirm one command is applied per tick with starvation under 1%, and that a deliberate burst of 20 stale commands is discarded.",
    dep: ["input-collection", "fixed-simulation-step"]
  },
  "input-delay": {
    s: "Deliberately holds local input for a few ticks before applying it, so it can be sent and received by the peer in time and fewer corrections are needed later.",
    d: "In rollback and lockstep systems, a local input is scheduled for a future tick, such as three ticks ahead, and sent immediately. The peer receives it before it is needed, so it rarely has to guess. Every tick of delay removes a tick of resimulation, but adds a tick of felt latency to the player's own controls. Systems pick a fixed delay, or one adapted to measured latency, and show the effect to the player as a setting. A delay constant above the real latency would give perfect agreement with no rollback but feel sluggish.",
    k: ["Fixed small delay with rollback for the remainder vs delay covering full latency: responsive controls, but visible corrections on bad links versus smooth but heavy-feeling controls.", "Adaptive delay vs fixed: tracks connection quality automatically, but a changing feel mid-match can confuse players."],
    p: ["Applying the same delay to menus and cosmetic actions makes the interface feel broken for no benefit.", "Choosing the delay from average latency ignores jitter spikes, which then force deep rollbacks."],
    v: "Measure button-to-screen latency at delay settings 0 to 5 on a 60 ms link and confirm each tick adds one tick's worth, while the mean rollback depth falls correspondingly.",
    dep: ["input-collection", "fixed-simulation-step"]
  },
  "remote-input-prediction": {
    s: "Guesses what a remote player will do when their real input has not arrived yet, usually by repeating their last input, and corrects if the guess was wrong.",
    d: "Rollback and lockstep variants cannot wait for remote input, so they simulate the next tick using a prediction, most often the previous input held. When the real input arrives, it is compared with the guess: if they match, nothing is redone; if not, the game rolls back and resimulates. Human input changes slowly relative to tick rate, so held-input guesses are right most of the time. Smarter predictors consider context such as in-progress animations. Mispredictions are most visible on rapid direction changes and on discrete actions such as a button press.",
    k: ["Repeat-last-input vs a modeled predictor: cheap and usually right, but fails on every change, while a model adds code and its own mistakes.", "Predicting buttons vs holding them neutral: keeps actions flowing, but wrongly predicted attacks cause visible un-happening on rollback."],
    p: ["Predicting a discrete action, such as a jump press, as held creates repeated false actions that are then visibly undone.", "Not recording what was predicted prevents the cheap comparison on arrival, so every input triggers a rollback."],
    v: "Play with 100 ms latency and log predictions against arrivals. Confirm the share of correct guesses matches expectation, and that rollbacks occur only on mismatches.",
    dep: ["input-delay", "rollback-netcode"]
  },
  "snapshot-generation": {
    s: "Captures the replicated state of the world at a tick and produces, for each client, the packets describing what that client should now believe.",
    d: "After each send-rate tick, the server walks relevant entities, gathers their replicated properties, and tags them with the tick number. A per-client pass selects the entities and properties that client needs, compares with the last state it acknowledged, and writes a delta. The result must fit the client's bandwidth budget, so low-priority content is deferred. Work scales with players times entities, so the loop is a prime target for batching, shared serialization of unchanged data and parallel execution. The snapshot's tick is how clients place it on the timeline.",
    k: ["Serializing once and sharing vs per-client serialization: far cheaper CPU for broadcast state, but per-client relevancy and deltas must be layered on top.", "Sending every tick vs a fixed lower send rate: more bandwidth for fresher data, or less bandwidth with more interpolation delay."],
    p: ["Generating snapshots mid-tick, with some entities already updated, captures a state that never existed.", "Per-client work done serially makes the server's tick time grow with player count until it misses its deadline."],
    v: "Run with the maximum players and entities and confirm snapshot generation fits its slice of the tick budget, and that every packet's tick stamp matches a fully completed simulation tick.",
    dep: ["entity-replication", "tick-rate", "replication-priority"]
  },
  "baseline-delta-compression": {
    s: "Encodes each snapshot as the differences from the last snapshot the client confirmed it received, so unchanged data costs nothing and a lost packet cannot corrupt later ones.",
    d: "The server remembers a ring of recent snapshots and, per client, the newest one the client has acknowledged. The next snapshot is written relative to that baseline: unchanged entities and fields are skipped, changed fields are sent compactly. If acknowledgements lag, the baseline is older and the delta larger, but still correct. The client keeps the same history and applies the delta to its copy of the baseline. If the baseline is no longer available, the server sends a full snapshot. Memory per client for history is the cost.",
    k: ["Delta against the acknowledged baseline vs against the previous snapshot: robust to any loss without resending, but on a lossy link deltas grow as the baseline ages.", "Full snapshots at intervals vs only on demand: periodic resync bounds error, but spends bandwidth on data that rarely needed it."],
    p: ["Deltas against an unacknowledged snapshot break decoding on the first lost packet.", "A baseline history shorter than the client's round trip leaves no baseline to refer to, forcing constant full snapshots."],
    v: "Drop 20% of snapshots and confirm every received snapshot decodes to the true server state, that mean packet size grows only modestly, and no desynchronization is reported.",
    dep: ["snapshot-generation", "acknowledgement-bitfield", "integer-compression"]
  },
  "snapshot-interpolation": {
    s: "Renders remote entities by smoothly blending between two received snapshots, so they move continuously even though updates arrive only tens of times per second.",
    d: "Because snapshots arrive at discrete moments, the client renders remote entities slightly in the past, at a time between two snapshots it already has, and blends their positions and rotations. Motion is smooth at any frame rate and independent of packet arrival jitter. The price is that other players are always seen about one interpolation delay behind the truth, which the server compensates for when judging hits. Discrete properties, such as an animation state, are switched at the right snapshot instead of blended.",
    k: ["Interpolating between received states vs extrapolating forward: always smooth and correct, but shows remote players in the past.", "Linear vs spline interpolation: cheap and predictable, but corners at snapshot boundaries are visible at low send rates."],
    p: ["Interpolating rotations component-wise instead of along the shortest arc makes characters spin the wrong way.", "Blending across a teleport slides the entity across the map instead of snapping."],
    v: "Record a remote entity's rendered position at display rate while snapshots arrive with jitter. Confirm there are no velocity discontinuities and the entity's offset from truth equals the configured delay.",
    dep: ["interpolation-buffer", "snapshot-generation"]
  },
  "interpolation-buffer": {
    s: "A short queue of received snapshots that holds enough history to keep interpolating through jitter and a lost snapshot, at the price of extra display delay.",
    d: "The client renders at a time equal to the newest snapshot time minus an interpolation delay, commonly two snapshot intervals plus a jitter margin. That keeps at least two snapshots available to blend between even if one is late or lost. The delay can be fixed or tuned adaptively from measured jitter and loss. Snapshots are stored by tick and inserted in order. Playback speed is nudged to hold the buffer at its target length. A buffer that is too short starves under jitter and the game falls into extrapolation; too long adds visible lag.",
    k: ["Adaptive buffer length vs fixed: fits each player's actual connection, but changes the delay mid-match and complicates lag compensation accounting.", "Delay of two intervals vs three: tolerates one lost snapshot versus two, at the cost of an additional send interval of delay."],
    p: ["A fixed delay tuned on the office network starves every mobile player into constant extrapolation.", "Letting playback speed change abruptly to refill the buffer makes remote motion visibly speed up and slow down."],
    v: "Simulate 10% loss and 30 ms jitter. Confirm the buffer never runs dry for more than 1% of frames and report the delay actually added, matching what the server assumes in lag compensation.",
    dep: ["snapshot-generation", "rtt-estimation"]
  },
  "extrapolation": {
    s: "Estimates where a remote entity is now by continuing its last known motion past the newest snapshot, used when the interpolation buffer runs out.",
    d: "When no newer snapshot has arrived, the client advances the entity using its last velocity, and optionally acceleration, for a short time. It avoids freezing, and errors for steady motion are small. For anything that changes direction, error grows quickly, so extrapolation is capped at a few hundred milliseconds, after which the entity stops or fades. When real data arrives, the visual position is blended toward the truth instead of snapped. It is also used for fast objects such as projectiles with predictable paths.",
    k: ["Extrapolating briefly vs freezing: motion stays continuous, but entities overshoot and visibly snap back when the player actually turned.", "Capped duration vs unlimited: bounds the error, but a long outage still stops entities in place."],
    p: ["Extrapolating without a cap sends entities through walls and off the map during a long stall.", "Applying extrapolated positions to gameplay checks, such as hit testing, gives results based on a guess."],
    v: "Hold snapshots back for 300 ms during steady and turning movement. Confirm steady entities stay within a small error, extrapolation stops at the cap, and the correction on resumption is blended, not snapped.",
    dep: ["snapshot-interpolation"]
  },
  "error-smoothing": {
    s: "Hides corrections by moving the displayed position gradually toward the corrected simulation position, instead of jumping the camera or model when prediction was wrong.",
    d: "When reconciliation finds that the client's predicted state differs from the server's, the underlying simulation is corrected immediately, but the rendered position keeps an offset that decays over a short time, perhaps 100 ms. Small errors vanish unnoticed; large errors, above a threshold such as a meter, are snapped. The decay can depend on speed and can be disabled for the view of the player's own camera, where smoothing reads as sluggishness. Combining several corrections in quick succession must not leave the offset growing without bound.",
    k: ["Visual offset decay vs immediate snap: no visible popping on small errors, but the displayed position lags the real one briefly and can look wrong at corners.", "Smoothing everything vs a threshold for snapping: avoids sliding across big errors, but needs a tuned limit per game."],
    p: ["Smoothing across a teleport or respawn drags the player visibly across the map.", "Stacked corrections each starting a new decay can accumulate an offset that never settles."],
    v: "Inject a 10 cm and a 3 m misprediction. Confirm the small one decays smoothly over the set time with no visible pop, while the large one snaps in a single frame.",
    dep: ["server-reconciliation"]
  },
  "client-side-prediction": {
    s: "Applies the local player's inputs to a local copy of the simulation immediately, without waiting for the server's response, so controls feel instant at any latency.",
    d: "The client runs the same movement code as the server on its own input and shows the result at once. Each input is stored with its tick, and sent to the server. When the server's authoritative state arrives, the client compares it with its own prediction for that tick. Shared deterministic code is essential; any difference between client and server code, or hidden state that only the server holds, makes the prediction wrong. Only what the player directly controls is predicted. Everything else is shown from snapshots.",
    k: ["Predicting only the local player vs also predicting interacting objects: simple and cheap, but anything pushed by the player looks laggy or rubber-bands.", "One shared movement code path vs separate client and server implementations: no divergence, but the code must run in both contexts without side effects."],
    p: ["Movement code that depends on server-only data, such as unreplicated state, makes the client mispredict constantly.", "Predicting consequences that can be vetoed, such as damage numbers, shows results that are then taken back."],
    v: "Add 150 ms of latency and confirm local movement responds on the next frame, and that the number of corrections per minute on an unobstructed path is zero.",
    dep: ["input-collection", "fixed-simulation-step", "server-authoritative-model"]
  },
  "server-reconciliation": {
    s: "Compares the client's predicted state with the server's authoritative state for the same tick and, on a mismatch, rewinds to the server's state and reapplies later inputs.",
    d: "Each authoritative update carries the tick of the last client input the server processed. The client finds its stored prediction for that tick, and if it differs beyond a tolerance, sets its state to the server's and replays all unacknowledged inputs after that tick. Inputs the server has already processed are discarded from the history. Differences arise from other players' effects, packet loss, or disagreement between client and server code. The tolerance prevents tiny floating-point differences from triggering endless corrections.",
    k: ["Replaying inputs after a correction vs accepting the server state as-is: preserves the local lead over the server, but costs CPU proportional to latency in ticks.", "A tight tolerance vs loose: accurate, but triggers corrections on numeric noise, while loose lets small drift accumulate."],
    p: ["Reconciling against the server's latest state instead of the matching tick compares different moments and always finds an error.", "Discarding input history too early leaves nothing to replay after a late correction."],
    v: "Make the server push the player sideways at a known tick. Confirm the client corrects within one round trip, ends at the server's position with all later inputs reapplied, and logs a single correction.",
    dep: ["client-side-prediction", "input-replay"]
  },
  "input-replay": {
    s: "Re-executes a stored list of the client's recent unacknowledged inputs on top of a corrected state, rebuilding the predicted present in one frame.",
    d: "After a correction, the client holds the server's state for tick N, and it has stored inputs for ticks N+1 up to the present. It steps the simulation forward through all of them within a single frame, producing the new predicted state. At 100 ms latency and 60 Hz that is about six steps, and at poor latency many more. The simulation must therefore be cheap enough to step several times per frame, and must be free of side effects such as sounds, particles and spawns during the replay, which are suppressed or deduplicated.",
    k: ["Replaying only the character controller vs the whole world: cheap and enough for most games, but interactions with predicted objects are not corrected.", "Capping replay length vs unlimited: bounds worst-case CPU, but a very late correction forces a snap instead."],
    p: ["Letting replayed ticks play sounds or spawn effects triggers them again every correction.", "Replaying with a different time step than the original ticks gives a different result and a visible jump."],
    v: "Force a correction with 12 stored inputs and measure that the replay completes within one frame, emits no duplicated effects, and ends at the same state as a run that never mispredicted.",
    dep: ["client-side-prediction", "fixed-simulation-step"]
  },
  "lag-compensation": {
    s: "Rewinds the server's world to the time the shooting player saw it, so a shot that looked like a hit on their screen is judged against the positions they actually saw.",
    d: "The server keeps a history of recent entity positions, hitboxes and states, a second or so deep. When a hit-scan command arrives, the server computes the time the client was displaying, from its latency and interpolation delay, moves relevant entities back to that time, performs the hit test, and restores them. The shooter experiences fair aiming at any latency. The cost is that targets can be hit after they believe they have taken cover, and rewind distance is capped to limit that. Storing history for every entity is memory and CPU heavy.",
    k: ["Rewinding the world to the shooter's view vs judging at server time: fair to the shooter at any latency, but defenders see themselves hit after reaching cover.", "Capping the maximum rewind vs unbounded: limits the advantage a high-latency player gets, but players above the cap miss targets they saw."],
    p: ["Trusting a client-supplied timestamp for the rewind lets cheaters shoot into the past by any amount.", "Forgetting to restore entities after the test corrupts the live simulation for the rest of the tick."],
    v: "With 120 ms latency, fire at a target moving at constant speed, aiming at what is displayed. Confirm hits register, and that a shot timestamped beyond the cap is clamped and logged.",
    dep: ["hit-validation", "interpolation-buffer", "server-authoritative-model"]
  },
  "hit-validation": {
    s: "The server's final decision on whether a claimed shot or attack hit, using rewound history and checking line of sight, range, cooldown and the shooter's state.",
    d: "A client sends the intent to fire, with the tick it saw and its aim, never a claimed result. The server rewinds, casts the ray against historical hitboxes, and verifies that the weapon could fire, with ammo, cooldown and state allowing it, that the origin is plausible given the player's position, and that the target was targetable. Only then does it apply damage and notify clients. Some games let the client claim hits and the server verify them loosely for responsiveness, trading cheat resistance for feel. Disagreements between what a player saw and the verdict are the commonest complaint in online shooters.",
    k: ["Server decides from intent vs trusting client-reported hits: resists cheating, but feels worse when the verdict contradicts the player's screen.", "Strict validation vs tolerant margins: fewer fake hits, but more legitimate shots rejected from small timing errors."],
    p: ["Trusting a client-reported hit position lets a modified client hit anyone anywhere.", "Validating against the server's present hitboxes without rewind rejects most legitimate hits from high-latency players."],
    v: "Replay recorded legitimate shots at 100 ms latency and confirm the hit rate matches what players saw within a small margin, and that synthetic impossible claims are all rejected and logged.",
    dep: ["lag-compensation", "server-side-validation"]
  },
  "deterministic-lockstep": {
    s: "Each machine simulates the whole game from the same ordered inputs; only inputs are exchanged, and a tick advances only when every player's input for it has arrived.",
    d: "The game state itself is never sent. All peers apply identical inputs to identical starting state through a fully deterministic simulation, and so stay identical. Bandwidth is tiny and independent of unit count, which suits strategy games with thousands of units. A tick cannot run until every input for it is in, so the game moves at the speed of the slowest connection, hidden by a short input delay. Any nondeterminism produces desynchronization that grows silently, so state checksums are exchanged regularly, and every peer must see the same game.",
    k: ["Lockstep vs state replication: tiny bandwidth and perfect agreement, but the slowest player paces everyone and determinism is mandatory.", "Peer-to-peer vs relayed inputs through a server: lower latency, but exposes addresses and any peer can try to cheat by seeing hidden information."],
    p: ["A single nondeterministic float operation or unordered iteration causes a silent desync discovered minutes later.", "Every peer holds the full state, so maphack-style cheating is trivial without added protection."],
    v: "Run four peers for an hour with an injected 5% loss. Confirm per-tick state checksums match on every peer at every checked tick and no peer ever advances without all inputs.",
    dep: ["determinism-requirements", "input-delay", "fixed-simulation-step"]
  },
  "rollback-netcode": {
    s: "Runs the game forward immediately using predicted remote inputs, and when the real inputs arrive and differ, restores an earlier saved state and resimulates to the present.",
    d: "Used heavily in fighting games, it saves a snapshot of the full game state each tick for a window of frames. Local input is applied at once, remote input is predicted, and the game never waits. On a misprediction, the engine loads the saved state at the tick of the wrong input and resimulates all ticks up to the present within a single frame, with rendering skipped for those. It requires fast, complete state serialization, fully deterministic simulation, and a simulation cheap enough to run many times per frame. Presentation effects need to be deduplicated across rollbacks.",
    k: ["Rollback vs lockstep: controls stay responsive on bad links, but needs cheap resimulation and state save, and visible corrections on misprediction.", "Saving full state each tick vs saving diffs: simple and fast to restore, but memory and copy cost grow with world size."],
    p: ["Gameplay events such as sounds or hits that fire during a speculative tick are not undone when the tick is rolled back.", "A simulation too heavy to run eight times per frame stutters badly exactly when the network is worst."],
    v: "Play across a 120 ms link and inject mispredictions. Confirm that rollback depth stays within its cap, frames are never skipped, and both machines show identical final states after each round.",
    dep: ["determinism-requirements", "remote-input-prediction", "input-delay", "fixed-simulation-step"]
  },
  "determinism-requirements": {
    s: "The conditions under which the same inputs always produce bit-identical state on every machine: fixed step, controlled randomness, stable ordering, and consistent arithmetic.",
    d: "A deterministic simulation avoids reading wall-clock time, uses a seeded random generator whose calls are part of the state, iterates containers in a defined order, and avoids anything that depends on memory addresses or thread timing. Floating-point math differs between compilers, instruction sets and optimization settings, so games either use fixed-point arithmetic, restrict to operations that are reproducible, or ship identical binaries. Physics and animation engines often break determinism. Every new feature is a new risk, so a continuous cross-machine test is the only real assurance.",
    k: ["Fixed-point math vs controlled floating point: guaranteed identical results anywhere, but more code and limited range, while floats are convenient but fragile across builds.", "Determinism by construction vs by testing: prevents classes of bugs, but constrains every system, while testing finds them late and misses rare paths."],
    p: ["Iterating a hash container whose order depends on addresses produces different results on different machines.", "A third-party physics library update changes float results, and old replays and lockstep peers silently diverge."],
    v: "Run the same input recording on machines with different processors and builds for a million ticks and compare per-tick state hashes. Any single mismatch fails the check and identifies the first divergent tick.",
    dep: ["fixed-simulation-step"]
  },
});
