// Details, part 4: matchmaking, hosting, voice, diagnostics, cross-cutting concerns.
ATLAS.details("multiplayer-netcode", {
  "lobby-service": {
    s: "A backend service where players create or join groups before a match, set options and ready up, and which hands the group to a server when it starts.",
    d: "A lobby is a small shared record: members, owner, ruleset, map, readiness and chosen region. Clients create, list, join and leave through a web interface and receive changes by a push channel. The service enforces capacity, ownership rules and visibility such as public, friends only or invite only. When the lobby launches, the service requests a game server, receives its address, and issues each member a connection token. Races are the main difficulty: two players taking the last slot, owner disconnects and simultaneous option changes.",
    k: ["Authoritative lobby service vs peer-hosted lobbies: consistent state and moderation hooks, but one more service to run and keep available.", "Push updates vs polling: instant lobby changes, but requires persistent connections and reconnection handling."],
    p: ["Two players joining the last slot at once overfill the lobby when capacity is checked and updated in separate steps.", "An owner leaving without a handover strands the remaining members in an unlaunchable lobby."],
    v: "Send 200 simultaneous join requests to a 4-slot lobby. Confirm exactly four succeed, the rest receive a clear refusal, and every member's view of the roster is identical afterward.",
    dep: ["party-management", "session-lifecycle", "connection-tokens"]
  },
  "matchmaking-queue": {
    s: "Collects players seeking a game and groups them into balanced matches by waiting them in a pool and widening acceptable criteria as time passes.",
    d: "Players or parties enter a queue with attributes such as skill, region, latency to each data center, mode and platform. A matcher runs continuously, forming candidate matches whose members satisfy constraints; criteria loosen with waiting time so no one waits forever. The output is a match: players, teams and the region to host. It trades match quality against wait time, and the population at a given hour limits what is possible. Reliability matters: a lost ticket means a player waits forever, and a duplicate means two matches for one person.",
    k: ["Strict quality criteria vs fast match formation: fairer games, but long waits in small populations, which is why criteria must relax with time.", "Centralized global queue vs per-region queues: better matches from a bigger pool, but cross-region latency hurts, so regional queues are common."],
    p: ["A player queued twice, from two devices, is placed in two matches and abandons one.", "Criteria that never relax make off-peak players wait indefinitely in empty queues."],
    v: "Queue a synthetic population across skill and region levels and confirm median wait is below target, skill spread in each match is within bounds, and every ticket resolves to exactly one match or a timeout.",
    dep: ["skill-and-region-matching", "party-management", "reservations-and-backfill"]
  },
  "skill-and-region-matching": {
    s: "Scores candidate matches by skill rating difference and measured latency between players and candidate server regions, picking the best acceptable region.",
    d: "Skill is a rating updated from results, with an uncertainty that shrinks as a player completes matches. Matchers keep teams close in aggregate rating and similar in spread. For region, clients measure latency to each candidate data center and report it with the ticket; the matcher picks a region where all members are under a limit and the sum is lowest. Both criteria conflict, and with a small population it chooses between a fair match and a close one. Rating systems also have to handle new players, smurfing and teams of unequal size.",
    k: ["Weight on skill vs weight on latency: balanced games, or playable ones, where the right mix differs by genre and population.", "Client-reported latency vs server-measured: reflects the real path to each region, but a modified client can lie to choose or avoid a region."],
    p: ["Matching on latency alone ignores skill and produces lopsided games in uncrowded regions.", "Using stale latency measurements taken at login picks a region the player's network no longer reaches well."],
    v: "Replay a day of recorded tickets through the matcher and confirm rating spread and worst-player latency per match stay inside configured bounds, and that the chosen region is the lowest-latency feasible one.",
    dep: ["rtt-estimation"]
  },
  "party-management": {
    s: "Keeps friends together as a group through queueing, matches and between them, with a leader, shared readiness and rules for how the group is matched.",
    d: "A party is a persistent group, outside any one match. It carries a leader, members and platform details, and it queues as one unit, with matching using the party's combined rating and the constraints of its members, such as the worst latency. Members receive invites and presence updates through a social service. Cross-platform parties need identity mapping and per-platform restrictions. The difficult behavior is edge cases: a member disconnecting while queued, leaders leaving, and parties of different sizes meeting in the same match.",
    k: ["Matching parties as a unit vs splitting them: friends play together, but the match is less balanced because party coordination is a hidden advantage.", "Leader-driven queueing vs any member starting: simple and predictable, but a leader who goes idle blocks the group."],
    p: ["A party member who loses connection during queue leaves the party matched without them and the others in a broken game.", "Rating parties by their average hides a high-skill player carrying lower-rated friends."],
    v: "Queue a party of three, disconnect one member mid-queue, and confirm the party is either re-queued with the remaining two or cancelled with notification, never matched incorrectly.",
    dep: ["lobby-service"]
  },
  "session-lifecycle": {
    s: "The states a match goes through, from created and waiting for players, to running, to ending with results recorded and the server released.",
    d: "A session object, held by the backend, tracks expected players, assigned server, state and timestamps. Players connect with tokens naming that session. The server reports readiness, that all expected players arrived, match start and end, and final results, which feed ratings and statistics. Timeouts handle players who never arrive and matches that are abandoned. Reconnection lets a player rejoin a running session while its slot is held. A lost end report leaves sessions stuck, so cleanup must run on timers independent of the server's cooperation.",
    k: ["Holding slots for disconnected players vs freeing them: allows rejoin after a crash, but a quitter keeps a slot and the others play short-handed.", "Server-reported results vs backend-observed: complete data, but a compromised server could report false outcomes."],
    p: ["A server crash before the end report leaves a session open forever, and its players cannot queue again.", "Writing results from both server and clients double counts match outcomes."],
    v: "Run a match, kill the server process mid-match, and confirm the backend marks the session failed within the timeout, releases the players for queueing, and records no result.",
    dep: ["server-allocation", "connection-tokens"]
  },
  "server-browser": {
    s: "A list of joinable servers with their names, player counts, ping and rules, letting players pick a game directly instead of being matched.",
    d: "Servers register with a directory service and send periodic heartbeats containing map, mode, player count and settings. Clients fetch the list with filters, then measure latency to candidates with small probe packets before choosing. Community-hosted servers need rules for moderation and rate limits on registration. Entries expire if heartbeats stop. The directory is a target for spam and for fake servers advertising other servers' names, and counts can lag, so a full server is a normal outcome of a click.",
    k: ["Directory with heartbeats vs broadcast discovery: works across the internet, but the directory is a service to run and defend.", "Showing measured ping vs reported ping: accurate to the player's network, but probing hundreds of servers takes time and traffic."],
    p: ["Trusting server-reported player counts lets operators inflate counts to rank higher.", "Probing every listed server at once triggers rate limits and shows false high pings."],
    v: "Register 500 test servers, stop heartbeats for 50 of them, and confirm those vanish from the list within the expiry time and client-measured pings differ from reported ones where the path is slower.",
    dep: ["session-lifecycle"]
  },
  "reservations-and-backfill": {
    s: "Holds slots on a game server for players who are connecting, and fills slots vacated in a running match with newly queued players.",
    d: "Before telling players to connect, the backend reserves slots on the server, so a full server cannot reject them. Each reservation has an expiry and a token, and the server confirms it on connect. Backfill is the reverse: when a player leaves a running match, the server posts open slots to the matchmaker, which finds suitable late joiners and issues tokens. Backfill must respect game rules, such as team balance and how far a round has progressed, and a late joiner needs the world state quickly, which stresses the spawn and snapshot path.",
    k: ["Backfill into running matches vs ending short-handed matches: fewer ruined games and shorter queues, but late joiners start at a disadvantage.", "Reserving before connect vs first-come joining: guarantees the slot, but expiry timing then decides whether idle reservations waste capacity."],
    p: ["Reservations that never expire when the player fails to connect strand slots until the match ends.", "Backfilling in the last minute of a match gives a new player nothing to play and no reward."],
    v: "Drop a player from a full match and confirm that a backfill ticket is issued, a new player connects with a valid reservation within the window, and unclaimed reservations expire and reappear as open.",
    dep: ["session-lifecycle", "object-spawning"]
  },
  "dedicated-server-process": {
    s: "A game server program run on a machine the operator controls, which hosts one or more matches authoritatively with no player on the same machine.",
    d: "The process loads the map and rules, binds a port, authenticates connecting players through tokens, and runs the simulation. It reports health and match state to the backend. Because no local player is present, it has no rendering, audio or input, which lets many instances share a machine. It runs under the operator's control, so players cannot tamper with it, and its network position is predictable. Its costs are hosting spend and operations. Key engineering work is stable memory use over long runs, graceful shutdown and fast startup.",
    k: ["Dedicated servers vs player hosts: fair, stable and secure, but a continuous cost scaling with concurrent players.", "One match per process vs several per process: isolation of crashes and simple cleanup, but more memory overhead per match."],
    p: ["A memory leak that is invisible in a 20 minute test crashes servers hours into live operation.", "Running several matches in one process lets one match's crash end all of them."],
    v: "Run a server under a bot load for 24 hours and confirm memory is flat, tick time stays within budget, and it exits cleanly after a drain command without dropping any active match.",
    dep: ["headless-simulation-mode", "connection-handshake", "tick-rate"]
  },
  "headless-simulation-mode": {
    s: "A build or run mode of the game that runs the full simulation without graphics, audio or input, so servers and tests use CPU and memory only for gameplay.",
    d: "Rendering, animation sampling, audio and UI are stripped or stubbed, while gameplay logic, physics and replication remain. Code that gameplay depends on, such as animation-driven hitboxes or navigation, must still work without a visual representation, or the server's behavior differs from the client's. The same mode runs automated bot tests at high speed and without a display. The difficulty is separating the game from presentation: any simulation dependency hidden in a rendering component works on the client and quietly breaks on the server.",
    k: ["Stripping presentation from the server build vs running the full game without a display: far lower cost per match, but gameplay must not depend on presentation.", "Single codebase with a headless flag vs a separate server project: clients and servers cannot drift, but the shared code carries both worlds' constraints."],
    p: ["Hitboxes driven by animation fail when the server skips animation, so shots that hit on screen miss on the server.", "Server-only code paths compiled out of client builds are not tested until deployment."],
    v: "Run the same recorded scenario in the headless mode and the full client. Confirm that state hashes per tick match, and the headless run uses a fraction of the CPU and no GPU.",
    dep: ["fixed-simulation-step"]
  },
  "server-allocation": {
    s: "Picks a machine in the right region with spare capacity, starts a server process for a match, and hands the address back to the backend.",
    d: "The matchmaker requests a server for a region and game mode. An allocator looks in a pool of ready, warmed servers and takes one, or starts a new one if the pool is empty. It passes the match configuration, waits for the readiness report, and returns the address and port. Start time dominates: loading maps in seconds is slow for players waiting, so pools of idle servers are kept. Allocation must be atomic, so no two matches get the same process, and failures should retry on another machine quickly.",
    k: ["Warm pool of idle servers vs starting on demand: matches start in a second or two, but idle servers cost money at all hours.", "Packing several processes per machine vs one: lower cost per match, but noisy-neighbor effects on tick time."],
    p: ["Two allocation requests claiming the same idle server send two groups to one match.", "A pool sized for average load runs dry at the evening peak and queue times spike."],
    v: "Fire 100 simultaneous allocation requests at a pool of 50 warm servers. Confirm each match gets a distinct process, the first 50 start in under two seconds, and the rest start through the scale-up path.",
    dep: ["dedicated-server-process", "fleet-autoscaling"]
  },
  "fleet-autoscaling": {
    s: "Grows and shrinks the number of server machines per region to follow player demand, keeping spare capacity without paying for idle hardware all day.",
    d: "Demand follows daily cycles and spikes at launches and events. The autoscaler watches concurrent matches, queue length, idle-server count and forecasts, and adds or removes machines to hold a target buffer. Machines take minutes to start, so scaling up must lead demand, using schedules and forecasts alongside reactive rules. Scaling down must never kill a running match, so machines are drained: no new allocations and removal when empty. Regions are scaled independently, and capacity exhaustion in one region must fall back to a neighbor.",
    k: ["Predictive scaling on schedules vs purely reactive: capacity is ready before the evening peak, but forecasts are wrong at launches and events.", "Cheap interruptible machines vs on-demand: much lower cost, but a machine can disappear mid-match unless matches are shielded or short."],
    p: ["Scaling down by terminating the least-used machine ends matches that were in progress.", "Reacting only to the current queue means players already wait several minutes when new machines come online."],
    v: "Replay a recorded demand curve with a sharp ramp against a staging fleet. Confirm the idle buffer never falls to zero, no running match is terminated on scale-down, and cost tracks the demand curve.",
    dep: ["server-allocation", "server-health-and-draining"]
  },
  "server-health-and-draining": {
    s: "Monitors each game server's liveness and performance, replaces unhealthy ones, and retires servers gracefully by refusing new matches until current ones end.",
    d: "Each server sends heartbeats with tick time, player count, match state and error counts. A supervisor marks servers as unhealthy when they stop reporting, exceed tick time limits, or leak memory, removes them from the allocation pool, and restarts them. For deployments, draining sets a server to accept no new matches and exit when its current match ends, so updates roll through the fleet with no interruption. A hung process that still answers heartbeats is the hard case, so health includes simulation progress.",
    k: ["Draining until matches end vs killing immediately: no player-visible interruption, but deployments take as long as the longest match.", "Health from heartbeats alone vs tick-progress checks: simple, but misses a frozen simulation that still sends heartbeats."],
    p: ["A frozen server that keeps sending heartbeats stays in the pool and is allocated to new matches.", "Deploying a new version by replacing servers instantly ends every live match at once."],
    v: "Freeze the simulation loop of one server in staging and confirm it is marked unhealthy within the timeout and replaced. Then drain another and confirm its match completes and no new match is assigned.",
    dep: ["dedicated-server-process"]
  },
  "listen-server-hosting": {
    s: "One player's machine acts as the server for the match and also plays in it, which costs the operator nothing but gives that player zero latency and an advantage.",
    d: "The host runs the authoritative simulation with its own local client attached, and other players connect to it directly or through a relay. It needs no fleet and works for small groups of friends. The host has no latency and sees the world first, and can modify the game. Quality depends on the host's connection and machine, and uploads from a home link limit the player count. When the host quits the match ends, unless it migrates. NAT traversal is nearly always required to reach the host.",
    k: ["Player-hosted vs dedicated: free to operate and zero operator infrastructure, but unfair latency, no cheat protection and a match that depends on one home connection.", "Host as authority vs host as peer: simple model, but the host sees all hidden information."],
    p: ["Hosts with slow upload links make every other player's match choppy and nobody knows why.", "A host who rage-quits ends the match for everyone with no recovery."],
    v: "Host from a home-grade connection with seven guests, throttled to typical upload. Confirm the match holds the target tick rate, measure guest latency, and observe what happens when the host quits.",
    dep: ["server-authoritative-model", "nat-traversal", "relay-server"]
  },
  "host-migration": {
    s: "Moves authority to another player's machine when the host leaves, so the match continues, by restoring the world state and reconnecting everyone to the new host.",
    d: "Peers must keep enough state to resume: the latest state snapshot, entity ownership and match rules. When the host disappears, remaining peers elect a successor using criteria such as connection quality or earliest join, the successor loads its latest state and opens for connections, and the others reconnect and resynchronize. State since the last snapshot is lost. It is hard to make reliable: elections can split, the state may be stale, and every connection must be rebuilt, which usually causes a pause of seconds. Many games decline to support it.",
    k: ["Migrating the match vs ending it: players keep their progress, but complexity is large and failure modes are subtle compared with a clean end.", "Pre-selected successor vs election after failure: faster handover, but needs the successor to stay ahead of state continuously."],
    p: ["Two peers each believing they were elected create a split match with two diverging worlds.", "A successor restoring a stale snapshot silently rolls the match back, discarding recent actions."],
    v: "Kill the host in a running 6-player match. Confirm one successor is elected, all remaining players reconnect within the target time, and the restored state is no older than the snapshot interval.",
    dep: ["listen-server-hosting", "ownership-transfer", "entity-replication"]
  },
  "voice-capture-and-codec": {
    s: "Captures microphone audio, cleans it up and compresses it with a low-latency speech codec into small frames sent many times a second.",
    d: "Audio is taken in short blocks, processed for echo cancellation, noise suppression and level control, and encoded at a few kilobits per second per speaker. Frames of 10 to 20 ms keep latency low. Voice-activity detection suppresses silence to save bandwidth. The codec offers features such as loss concealment and in-band redundancy. Platform audio devices differ widely in latency and quality, and echo cancellation needs access to the playback signal. Hard parts are device handling, such as hot-swapping headsets, and CPU cost on weak hardware.",
    k: ["Lower bitrate vs higher quality: less bandwidth in large lobbies, but muddier speech and more artifacts under loss.", "Push-to-talk vs open microphone with detection: less noise and traffic, but open mic is more natural and needs reliable voice-activity detection."],
    p: ["Skipping echo cancellation makes speaker output feed back into everyone's headset.", "Voice activity thresholds set too sensitive transmit keyboard noise constantly, using bandwidth and annoying players."],
    v: "Play a speech recording into the capture path with simulated device switching and 10% loss. Confirm intelligibility by listening, measure bitrate and latency end to end, and check that silence sends nothing.",
    dep: []
  },
  "voice-transport": {
    s: "Moves voice frames between players on their own unreliable channel or connection, with a small jitter buffer at the receiver that smooths arrival times into steady playback.",
    d: "Voice packets are sent on an unreliable channel, since retransmitting speech late is worse than losing it. A server or peer mesh forwards frames to listeners. The receiver keeps a short jitter buffer, tens of milliseconds, reordering frames and filling gaps with loss concealment from the codec. Large groups use a server to forward or mix, since a peer mesh scales as the square of players. Voice shares the player's bandwidth with game state, so its budget is explicit, and its own congestion handling may lower bitrate.",
    k: ["Server-forwarded voice vs peer mesh: constant upload per player and room for moderation, but server bandwidth costs and added latency.", "Larger jitter buffer vs smaller: fewer glitches on bad links, but speech arrives later and conversations suffer."],
    p: ["A peer mesh for a 16-player lobby makes every player upload fifteen streams and drowns slower links.", "Sharing a reliable ordered channel with game events delays speech behind lost packets."],
    v: "Run an 8-player voice session with 5% loss and 40 ms jitter. Confirm speech remains intelligible, end-to-end delay stays under 200 ms, and per-player voice bandwidth stays within its budget.",
    dep: ["voice-capture-and-codec", "unreliable-channel", "relay-server"]
  },
  "voice-spatialization": {
    s: "Positions each speaker's voice in 3D relative to the listener, with distance attenuation and direction, and limits who hears whom by team, range or channel.",
    d: "The receiver applies volume and panning from the speaker's position, usually replicated through the game, and filters or occludes by walls where designed. The server can decide who hears whom: team channels, proximity chat, dead-player chat and party channels, avoiding sending voice no one will hear. Positions and listener channels follow the game's relevancy data, so voice and game must agree on who is near whom. The cost is mixing many voices in real time and keeping attenuation consistent with what players see.",
    k: ["Proximity voice vs channel voice: immersive and emergent, but hard to scale and to moderate in crowds, while channels are simple but less natural.", "Server-side routing vs client-side filtering: saves bandwidth and prevents eavesdropping across teams, but adds server logic tied to game state."],
    p: ["Sending all voices to all players and muting on the client lets cheat tools listen to enemy team channels.", "Using stale positions for attenuation makes voices come from where speakers were a second ago."],
    v: "Walk a speaker around a listener at a set distance and confirm attenuation and panning follow position with no lag. Verify that an opposing-team listener receives no voice packets at all.",
    dep: ["voice-transport", "relevancy-rules"]
  },
  "voice-moderation": {
    s: "Tools that let players mute and report others and that let the operator review, filter and penalize abusive voice communication, within privacy and legal limits.",
    d: "Players can mute individuals, mute everyone, and report with a short audio clip retained for review. Operators may use automated detection of abuse to prioritize reports, with human review for decisions. Retention windows, consent and regional laws govern what is recorded. Muting must be enforced both ways: a muted player's audio should not be sent to the one who muted them. Moderation connects to the report and ban system, and communication restrictions can be applied independently of bans from play.",
    k: ["Recording clips for reports vs no recording: evidence for enforcement, but privacy, storage and legal obligations that must be handled carefully.", "Automated detection to triage vs human-only review: scales to large volume, but misjudges accents, slang and context."],
    p: ["Muting only on the playback side still sends voice to the muted listener and wastes bandwidth.", "Keeping voice clips with no deletion schedule creates a privacy and legal liability."],
    v: "Report a test clip, confirm that it reaches the review queue with match context attached, mute a speaker, and verify no voice packets from that speaker reach the muting player afterward.",
    dep: ["voice-transport", "report-and-ban-pipeline"]
  },
  "network-condition-simulator": {
    s: "A tool that adds latency, jitter, loss, duplication and reordering to traffic on purpose, so netcode is tested under bad conditions on a good network.",
    d: "It sits in the packet path, either inside the game's transport layer, as an operating system packet filter or as a network appliance, and delays, drops, duplicates and reorders packets by configured distributions. Profiles model real links: mobile, congested Wi-Fi, a transcontinental route, a burst-loss connection. Developers use it in daily play, automated tests use scripted profiles, and designers feel what players on weak links feel. Real loss comes in bursts and latency varies with load, so simple uniform random settings underestimate difficulty.",
    k: ["In-game simulator vs system-level tool: easy to use and per-connection, but misses behavior of the real network stack and operating system.", "Uniform random loss vs recorded or burst models: simple, but real networks fail in correlated bursts that expose different bugs."],
    p: ["Testing only with constant latency misses jitter, which is what breaks interpolation buffers and clock sync.", "Applying the simulator to both directions on a local test hides asymmetric path bugs."],
    v: "Apply a recorded mobile profile and play a full match. Confirm that observed round-trip, loss and jitter in the diagnostics match the profile, and that automated tests fail when the profile is made worse than the design limit.",
    dep: ["udp-socket-layer"]
  },
  "replay-recording": {
    s: "Records a match so it can be watched again, either as an input stream replayed through a deterministic simulation, or as a stream of snapshots from the server.",
    d: "Input-based replays store the start state and every player's inputs, and play back by rerunning the simulation, which makes them tiny but dependent on determinism and the exact build. Snapshot-based replays store the server's replicated state over time, with deltas and keyframes, and play back through the normal client interpolation path, working across builds and allowing free cameras at larger size. Replays serve spectating, highlights, bug reproduction and anti-cheat review. Seeking needs periodic keyframes, and format versioning keeps old replays playable.",
    k: ["Input replay vs snapshot replay: far smaller files, but needs perfect determinism and the same build, while snapshots are bigger and robust.", "Server-side recording vs client-side: complete and trustworthy, but costs server storage, while clients record only their relevant view."],
    p: ["A replay that desynchronizes midway shows a different match from the one played and misleads review.", "No keyframes make seeking to minute 30 replay the entire match from the start."],
    v: "Record a match, play it back on another machine and compare per-tick state hashes with the recorded ones, and seek to three random points in under a second each.",
    dep: ["snapshot-generation", "determinism-requirements", "input-collection"]
  },
  "latency-loss-jitter-graphs": {
    s: "An in-game and tooling view that plots round-trip time, packet loss, jitter, bandwidth and buffer state over time for each connection.",
    d: "Counters from the transport feed a rolling window per connection: RTT and its variance, loss by direction, bytes per second by channel, snapshot interval, interpolation buffer depth, correction counts and input starvation. These are drawn as graphs players and developers can open, with a compact network indicator for everyone. Graphs make the difference between the network's and the game's contribution visible, for example whether a stutter is lost snapshots or a slow server tick. Server-side versions summarize across players and regions.",
    k: ["Per-direction loss and bandwidth vs combined: shows which side has the problem, but needs counters from the peer to be reported back.", "Always-on lightweight indicator vs on-demand detail: players see problems, but a persistent display adds noise and some overhead."],
    p: ["Showing only RTT hides loss and jitter, which are what players actually feel.", "Averaging over a long window smooths away the spikes that cause complaints."],
    v: "Apply a known loss and jitter profile. Confirm the graphs show the same values within a few percent and that a deliberate server tick stall appears as its own distinct signal.",
    dep: ["rtt-estimation", "network-condition-simulator", "acknowledgement-bitfield"]
  },
  "desync-detection": {
    s: "Compares checksums of simulation state across machines at agreed ticks to find the first tick where they diverge, and captures state for debugging.",
    d: "Lockstep and rollback peers periodically hash their full state, or key parts, and exchange the hashes; a mismatch means divergence. In state-replication games, the server sends a hash of selected state and clients compare it with what they hold. On a mismatch the system records the tick, dumps state from every machine and diffs them to find the first differing field. Detection can end the match or trigger a resynchronization. The hash should be cheap and cover what matters; hashing everything every tick is expensive.",
    k: ["Hashing every few ticks vs every tick: low cost, but the first divergent tick has to be found by bisecting stored states.", "Hashing the full state vs key fields: catches everything, but costs CPU and can flag harmless differences, while key fields are cheap and can miss real ones."],
    p: ["Including uninitialized padding bytes or pointers in the hash gives false mismatches.", "Detecting divergence but not capturing state leaves developers a report with nothing to debug."],
    v: "Inject a deliberate one-bit nondeterminism at tick 5,000 in one peer. Confirm detection within the hash interval, reports the right tick and field, and saves state dumps from both peers.",
    dep: ["determinism-requirements", "deterministic-lockstep"]
  },
  "netcode-telemetry": {
    s: "Aggregated measurements from live matches, such as per-player latency, loss, disconnect reasons, correction rates and tick-time overruns, sent to a backend for analysis.",
    d: "Servers and clients report counters at the end of each match, and periodically during it: connection quality per player, region and platform, causes of disconnects, correction and rollback counts, server tick overruns, bandwidth. The backend aggregates and compares across builds and regions, alerts on regressions, and lets engineers filter to a worst-case player. It answers questions that the lab cannot, such as which networks are poorly served. Volume needs sampling and compact formats, and data about players has privacy obligations.",
    k: ["Per-match summaries vs continuous streaming: cheap and enough for trends, but short events and causes are lost, while streaming costs more.", "Sampling a fraction of matches vs all: bounded cost, but rare problems on rare networks go unseen."],
    p: ["Averages across all players hide a bad experience that affects one region or platform.", "Collecting identifiable network addresses without a purpose and retention limit creates privacy liability."],
    v: "Ship a build with a deliberately worse interpolation buffer to a small group and confirm the dashboards show the change in correction and complaint rates within a day, split by region.",
    dep: ["latency-loss-jitter-graphs"]
  },
  "packet-capture": {
    s: "Records packets and decoded message traces at either end, with timestamps and sequence numbers, so a bug seen by one player can be examined offline.",
    d: "A capture hook writes each packet's time, size, direction, sequence and decoded message list to a ring buffer or file, optionally with the keys needed to decrypt it. Decoding uses the same schema as the game, so tools show message names and fields. Captures can be dumped automatically on a desync, disconnect or hitch. Matching a client's capture with the server's reveals where packets were delayed, dropped or malformed. Storage and privacy matter: captures hold player data, and encrypted traffic is opaque without key logging, which must be disabled in release builds.",
    k: ["Capturing decoded messages vs raw packets: readable and compact, but depends on a working decoder, while raw is complete and needs tools.", "Always-on ring buffer vs on-demand capture: the moment before a bug is already recorded, but costs memory and some CPU constantly."],
    p: ["Leaving key logging enabled in release builds lets anyone decrypt captured traffic.", "Clocks that disagree between client and server captures make it impossible to line up events."],
    v: "Trigger a forced disconnect and confirm both ends dump a capture covering the preceding ten seconds, that tooling decodes the messages by name, and that the two captures align on packet sequence numbers.",
    dep: ["schema-definition", "packet-header"]
  },
  "bot-soak-testing": {
    s: "Runs many automated clients against a server for hours to expose scaling limits, memory growth and rare network-state bugs that short manual tests never hit.",
    d: "Headless bot clients connect through the real handshake, play scripted or random inputs, and run with simulated network conditions. Hundreds or thousands of bots show how tick time grows with player count, where bandwidth peaks, and whether memory or connection slots leak across hours. Bots join, leave and reconnect at random to stress lifecycle code, and checks assert invariants such as agreement of replicated state. They are part of every release gate for servers. Bot behavior must resemble players, or the load tested is not the load that arrives.",
    k: ["Bots running the real client code vs a protocol-only load generator: realistic and tests the full path, but heavier per bot than a simple packet sender.", "Scripted behavior vs random input: reproducible failures, but random input finds paths no one thought to script."],
    p: ["Bots that all stand still generate almost no replication load and give false confidence about capacity.", "Soak runs that check only that the server stays up miss slow leaks and state divergence."],
    v: "Run 500 bots for 12 hours with churn and a loss profile. Confirm that tick time at the 99th percentile stays in budget, memory is flat after warm-up, and every state-agreement check passes.",
    dep: ["dedicated-server-process", "network-condition-simulator", "connection-handshake"]
  },
  "trust-boundary": {
    s: "The decision about what the server believes from clients, which fixes where checks are needed, what must never be sent, and how much cheating the game can survive.",
    d: "Everything on the client's machine is under the player's control, so the line between trusted and untrusted code is drawn in the architecture: the server owns outcomes, and clients own presentation. Moving the line toward the client buys responsiveness and simplicity and loses security, and it is very hard to move back later because movement, hit detection and economy code are all written around it. Each new feature restates the question: can the client claim this, and what is the damage if it lies? Defense in depth combines validation, hidden information and detection.",
    k: ["Strict server ownership vs convenient client claims: resists cheating from the start, but costs latency-hiding machinery and server load.", "Early threat modeling vs adding protection after launch: cheap in design, but retrofitting authority into client-trusting code usually means a rewrite."],
    p: ["Treating the network encryption as the defense, when the cheating client holds the keys.", "Each convenient client-trusted shortcut accumulates until the sum of exceptions is the main attack surface."],
    v: "Run a modified-client test suite that attempts every category: speed, teleport, damage, item grant, hidden-data read. Each attempt should be rejected or yield nothing useful, and all attempts should show in server logs.",
    dep: ["server-authoritative-model", "server-side-validation", "state-obfuscation"]
  },
  "latency-budget": {
    s: "The allocation of the time from button press to visible effect across input sampling, network, server tick, interpolation delay and display, with a target for each.",
    d: "End to end latency is a sum: input sampling, tick alignment, one-way network time, server buffer and simulation, snapshot send interval, return network time, interpolation delay and display latency. Each design choice spends part of it: a lower send rate adds interval delay, a deeper buffer adds jitter tolerance and delay, rollback removes delay at CPU cost. Prediction removes the network portion for the local player but not for what they see of others. Setting a budget per stage makes trade-offs explicit and measurable.",
    k: ["Spending latency on jitter tolerance vs on responsiveness: smoother play on bad links, but every added buffer delays every player, even those with good connections.", "Budgeting the whole chain vs optimizing parts independently: finds the largest contributor, but requires end-to-end instrumentation first."],
    p: ["Optimizing the network stack while a 100 ms display pipeline dominates the delay changes nothing players feel.", "Adding a small buffer in each of six places quietly adds up to a visible delay."],
    v: "Measure button-to-photon latency on a test rig with a high-speed camera and compare it with the sum of per-stage budgets. The measured total should match the budget within a frame, with each stage visible.",
    dep: ["tick-rate", "interpolation-buffer", "client-side-prediction"]
  },
  "network-resource-budget": {
    s: "The limits on bytes per second per player and on server CPU per player and per tick, which together set player counts, entity counts and the cost of running the game.",
    d: "Every feature has a network cost and a server cost. Bandwidth limits come from player connections, mobile data and the operator's egress bill, while CPU limits come from tick time at the target tick rate. These two budgets bound maximum players per match, players per machine and cost per player-hour. Budgets are allocated across replication, voice, reliable events and overhead, and measured in CI so regressions show up on the day they are introduced. Simple features such as an extra replicated property can multiply across every entity and client.",
    k: ["Fixed budgets enforced in tests vs measured after the fact: regressions are caught early, but budgets must be set before the content exists.", "Optimizing bandwidth vs server CPU: compression and delta coding cost CPU, so at scale the cheaper resource depends on pricing and hardware."],
    p: ["A property added to every entity grows bandwidth linearly in players times entities and breaks the budget silently.", "Budgets measured with eight bots miss the quadratic costs that appear at sixty-four players."],
    v: "Run the maximum-players scenario in CI and fail the build if per-client bandwidth or tick time exceeds the configured budget, with the per-feature breakdown printed on failure.",
    dep: ["bandwidth-budget", "tick-rate", "replication-priority"]
  },
  "determinism": {
    s: "Whether the same inputs always produce the same state on every machine, which decides whether lockstep, rollback, input replays and compact replays are possible at all.",
    d: "A deterministic simulation lets machines exchange only inputs, record tiny replays and verify each other with checksums. It also constrains everything: arithmetic, iteration order, random numbers, physics, threading and libraries. Server-authoritative state replication does not need it, but benefits for prediction accuracy: client and server must agree closely or reconciliation fires constantly. The decision is made at the start, since adding determinism to a finished game is close to impossible.",
    k: ["Strict determinism vs tolerance with correction: enables input-only sync and tiny replays, but constrains all code, while correction is flexible and costs bandwidth.", "Determinism within one build vs across platforms: achievable by identical binaries, but cross-platform play needs fixed-point or carefully controlled math."],
    p: ["Using an engine system that is not deterministic, such as physics, in a lockstep game forces a rewrite or a different model.", "Partial determinism that holds in tests and fails on one device model is found only through live desync reports."],
    v: "Cross-platform hash comparison: run the same long input recording on every target platform and compare per-tick hashes. All platforms should produce identical hashes for the full run.",
    dep: ["determinism-requirements", "fixed-simulation-step"]
  },
  "protocol-evolution": {
    s: "How message formats, replicated state and game rules change over live releases while old and new builds, replays and servers coexist for some time.",
    d: "Live games patch often, and clients and servers update at different times. A protocol version in the handshake, a compatibility policy, additive-only schema rules and replay versioning let releases roll out without breaking players. Strict equality forces a simultaneous update; compatibility windows need tests across version pairs. Server fleets must roll gradually, and matchmaking must keep versions apart. The packed binary format makes careless changes dangerous, so changes go through the schema and a compatibility check in the build.",
    k: ["Forced simultaneous update vs a compatibility window: simplest and safest, but players cannot play until they patch, while a window needs cross-version testing.", "Schema compatibility checked in the build vs by review: catches accidental breaks automatically, but needs tooling and a stored previous version."],
    p: ["A schema change merged without a version bump produces garbled state only for players who have not updated.", "Matchmaking that mixes versions in one match makes the older clients crash or desync."],
    v: "Build the previous release's client and the new server in CI and connect them. The result should be the documented outcome: working play within the window, or a clean refusal, never a crash.",
    dep: ["schema-versioning", "schema-definition"]
  },
  "adverse-networks": {
    s: "The assumption that real networks lose, delay, reorder and duplicate packets, change addresses, and sit behind restrictive translators, and that the design must still feel acceptable.",
    d: "Players connect over mobile data, shared wireless and congested links. Latency varies from 10 to several hundred milliseconds, loss comes in bursts, and a phone may switch networks mid-match. Every layer needs a stated behavior at the worst supported condition: what the interpolation buffer does, how inputs are recovered, when the connection is declared dead, what the player sees. Designing only for a good network works in the lab and fails in public, so bad conditions are simulated from the first prototype and measured in live telemetry.",
    k: ["Designing for the median connection vs the worst supported: better feel for most players, but a visible fraction of the audience is left with a broken game.", "Adapting automatically to conditions vs fixed settings: serves each player well, but the changing behavior is harder to test and to explain."],
    p: ["Tuning only on the developer's wired network ships a game that fails for every mobile player.", "No defined behavior at the limit means each layer fails differently, and the combination is unpredictable."],
    v: "Play a full session under the worst supported profile: loss bursts, 200 ms latency and jitter, and one network switch. The game should stay playable, with defined and observed behavior at each limit and no crash.",
    dep: ["network-condition-simulator", "congestion-control", "keepalive-and-timeout"]
  },
});
