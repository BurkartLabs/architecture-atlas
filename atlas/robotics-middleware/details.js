// Details for the robotics middleware plate, part 1: tools, recording, simulation, nodes.
ATLAS.details("robotics-middleware", {
  "command-line-tools": {
    s: "A set of terminal commands that list nodes and topics, print or publish messages, call services and show rates, giving any engineer a way to touch the live graph without writing code.",
    d: "Each command joins the graph as a short-lived node, queries discovery for names and types, and then subscribes, publishes or calls a service. Tab completion reads the live graph. Because the tool is itself a participant, it uses the same transport and policies as the code under test. The difficulty is that observing changes the system: a subscribing tool adds load, and a tool with mismatched policies sees nothing even though the data is flowing.",
    k: ["Tools as ordinary graph participants vs a privileged inspection channel: tools stay simple and honest about what a real subscriber sees, but they add traffic and obey the same security rules.", "Printing every message vs sampling: full printing shows exact content, while sampling is cheap enough to run on a loaded robot but can hide a single bad message."],
    p: ["Echoing a high-rate image topic over a wireless link saturates it and starves the real consumers.", "The tool subscribes with default policy and reports a silent topic, though a stricter publisher is simply refusing to match."],
    v: "Start a publisher at 10 Hz, run the rate command, and confirm it reports about 10 Hz with low variance. Stop the publisher and confirm the topic list shows zero publishers within a second or two.",
    dep: ["participant-discovery", "topics-and-publishers", "subscriptions-and-callbacks"]
  },
  "graph-inspector": {
    s: "A viewer that draws nodes as boxes and topics, services and actions as edges, built live from discovery so engineers can see who is connected to whom.",
    d: "It queries the discovery layer for every node, endpoint and type, groups them by namespace, and renders a directed graph that updates on graph change events. Dead or hidden nodes can be filtered. The main use is spotting wiring mistakes: a subscriber with no publisher, two nodes publishing the same topic, or a name that was remapped wrongly. It is hard to keep readable at hundreds of nodes, and it only knows what discovery reports, not whether data actually flows.",
    k: ["Discovery-derived graph vs graph declared in launch files: derived shows what is really running, while declared shows intent, and the two disagreeing is the useful signal.", "Showing all endpoints vs collapsing by namespace: full detail finds wiring errors, but a collapsed view is the only one legible on a large robot."],
    p: ["An edge drawn between two nodes suggests data flows, but an incompatible policy means they never actually matched.", "Introspection queries at high rates load discovery traffic on a large graph and slow node startup."],
    v: "Launch a pipeline of three nodes, confirm the graph shows them chained in the right order, then kill the middle node and confirm its edges disappear and the downstream node shows no publisher.",
    dep: ["graph-change-events", "endpoint-matching", "graph-names-and-resolution"]
  },
  "three-d-visualizer": {
    s: "A 3D viewer that displays the robot model, transforms, point clouds, maps, paths and markers published by nodes, so engineers can check that perception and planning agree with the real world.",
    d: "It subscribes to display topics and the transform tree, places each message in a common fixed frame using lookups at the message timestamp, and draws it with a graphics pipeline. Plugins handle each message type. Interactive markers let a human drag a goal. It is hard because it exposes every frame and timestamp error as visible misalignment, and because it is a heavy subscriber: point clouds and images consume bandwidth and memory.",
    k: ["Rendering in a fixed frame vs the sensor frame: fixed frames show motion honestly but depend on the transform tree being correct; sensor frames hide transform errors.", "Subscribing to raw high-rate data vs downsampled copies: raw data is faithful, but decimated topics keep a remote viewer usable."],
    p: ["Clouds that smear while the robot turns usually point to timestamp or interpolation error, but are misread as a sensor fault.", "A viewer on the robot's own computer steals CPU from the control loop it is meant to observe."],
    v: "Drive the robot slowly past a wall with the viewer open and confirm the wall's points stay fixed in the map frame without smearing, and that the model's wheels turn as the joint topics change.",
    dep: ["transform-buffer-and-lookup", "robot-description-model", "subscriptions-and-callbacks"]
  },
  "plotting-and-time-series": {
    s: "Tools that plot numeric fields from live topics or a recording against time, with multiple signals on shared axes, to analyze controller behavior and sensor noise.",
    d: "A plot tool subscribes to chosen fields, extracts them using the message schema, and buffers values against their header timestamps or arrival times. Offline, it loads a recording and lets the user scrub and compare. Its choices matter: plotting arrival time instead of the measurement stamp shows network jitter instead of the signal. It is hard because message types nest arrays and structures, and because lining up streams recorded at different rates and clocks requires explicit resampling.",
    k: ["Plot by header stamp vs arrival time: stamps show the physical signal, while arrival time shows delivery quality; picking the wrong one answers the wrong question.", "Live plotting vs offline plotting from a recording: live is immediate, offline can be repeated and shared, and avoids loading the robot."],
    p: ["Comparing two signals on arrival time makes a fixed processing delay look like a controller lag.", "Plotting every field of a large message at full rate exhausts memory in the tool within minutes."],
    v: "Publish a known 1 Hz sine wave, plot it by header stamp, and confirm period and amplitude match. Then add 50 ms of artificial delivery delay and confirm only the arrival-time plot shifts.",
    dep: ["message-timestamps", "serialization-format", "subscriptions-and-callbacks"]
  },
  "diagnostics-aggregation": {
    s: "A convention and a collector that gather named status reports from hardware drivers and nodes, with levels of ok, warning or error, into one hierarchical view of robot health.",
    d: "Each node publishes small structured status messages on a shared diagnostics topic, with a name, hardware identifier, level and key-value details. An aggregator groups them by configured rules, applies staleness timeouts so silence is shown as a fault, and republishes a summary. Dashboards and automated monitors read the summary. The difficulty is calibration: thresholds that are too tight create alarm fatigue, and a status message from a crashed node simply stops arriving.",
    k: ["Heartbeat-style periodic status vs event-only reports: periodic lets silence be detected as failure, but costs steady traffic from every node.", "Central aggregation rules vs each node deciding its own level: central rules give consistent grouping, while node-local levels reflect knowledge only the node has."],
    p: ["A node that crashes stops publishing, and with no staleness rule its last good status stays on the dashboard.", "Every cell voltage reported as a separate warning buries the one alarm that matters."],
    v: "Kill a driver node and confirm the aggregated status for it turns to stale or error within the configured timeout, while the unaffected branches of the tree stay at ok.",
    dep: ["topics-and-publishers", "liveliness", "managed-node-states"]
  },
  "remote-web-bridge": {
    s: "A gateway that exposes the robot's topics, services and parameters over a web protocol so browsers and remote tools can view and command the robot without joining its internal network.",
    d: "The bridge runs on the robot as a node. It subscribes on behalf of remote clients, converts messages to JSON or a compact binary format, and sends them over a persistent web connection, with throttling per client. It translates service calls and publish requests the other way. It is the usual path from a robot to a web dashboard or a fleet server. It is hard because the internal network trusts everyone, and the bridge must not extend that trust to the internet.",
    k: ["Bridge as a node vs native protocol support in the middleware: a node needs no change to the core and is easy to deploy, but adds a copy and a conversion on every message.", "Per-client throttling vs forwarding at source rate: throttling protects slow links, but clients see different data rates than the robot publishes."],
    p: ["An unauthenticated bridge lets any host on the network publish velocity commands.", "A slow remote client causes the bridge to queue messages without bound and run the robot out of memory."],
    v: "Connect a browser client over a throttled link, subscribe to a pose topic and confirm it receives at the throttled rate. Then try to publish to a topic the access policy forbids and confirm it is refused.",
    dep: ["topics-and-publishers", "access-control-policy", "serialization-format"]
  },
  "recorder": {
    s: "A node that subscribes to selected topics and writes every message with its receive time to a file, producing a replayable record of what the robot saw and did.",
    d: "The recorder discovers the chosen topics, subscribes with settings compatible with every publisher, and appends messages to a writer thread through a queue. Each record holds the topic, type, timestamp and serialized bytes, so no decoding is needed at record time. It stores the type definitions in the file so playback works later. It is hard because it must keep up with the highest-rate topics, such as images, without slowing the robot, and without dropping the one message that explains the failure.",
    k: ["Recording serialized bytes vs decoded values: raw bytes are fast and exact, but readers need the schema, which must be stored with the data.", "Writing in the receiving thread vs a separate writer with a queue: a queue avoids blocking callbacks but can overflow under a disk stall, losing messages."],
    p: ["Disk write stalls overflow the queue and lose messages silently, so the recording looks complete but has gaps.", "Recording with a mismatched reliability setting fails to match publishers, producing a file with an empty topic."],
    v: "Record a 30 second run with a known publisher at 100 Hz and confirm the file holds 3000 messages with strictly increasing timestamps and no gap larger than twice the period.",
    dep: ["subscriptions-and-callbacks", "recording-container-format", "serialization-format", "qos-compatibility-matching"]
  },
  "recording-container-format": {
    s: "The file layout that stores messages, schemas and metadata in chunks, with compression and an index, so a recording stays readable, seekable and independent of the tool that wrote it.",
    d: "A header names the format version, then data is written in chunks, each holding messages from many topics and optionally compressed. A summary section at the end lists topics, types, schemas, chunk offsets and message counts. Schemas are embedded so a reader can decode without the original packages. Open, language-neutral containers let different tools read the same file. The hard parts are crash safety, since a recorder killed mid-write must leave something recoverable, and keeping the format stable across years of old recordings.",
    k: ["Chunked compressed storage vs plain append: compression cuts size a great deal for images, but a damaged chunk loses everything inside it.", "Index at file end vs index per chunk: an end index gives fast seek but is missing if the writer crashes, so recovery has to rebuild it by scanning."],
    p: ["A recorder killed by a power loss leaves a file with no summary, and naive readers refuse to open it.", "Embedding no schema ties the recording to a software version that no longer builds."],
    v: "Kill the recorder with a hard stop mid-run, then run the recovery tool and confirm the file opens, reports its topics and replays all messages written before the kill.",
    dep: ["serialization-format", "type-identity-and-versioning"]
  },
  "indexing-and-seek": {
    s: "Metadata that lets a player or analyzer jump to an arbitrary time, or read one topic, without scanning the whole recording.",
    d: "The index maps time ranges to chunk offsets and records per-topic message counts and time bounds. A reader finds the chunk covering the target time, decompresses only it, and skips topics it does not need. This makes scrubbing in a viewer fast and lets analysis jobs read one sensor from hours of data. It is hard because chunks mix topics, so reading one topic still decompresses chunks full of images, and because messages are ordered by receive time, not stamp.",
    k: ["Per-chunk time index vs per-message index: a chunk index is small and fast to write, but seeking lands near the target and then scans forward.", "Chunks mixing topics vs one chunk series per topic: mixed chunks keep time order cheaply, while separate series make single-topic reads fast at the cost of multi-topic merging."],
    p: ["Seeking by receive time into a recording with late-arriving messages shows data from before the target.", "Very large chunks make scrubbing slow because each seek decompresses hundreds of megabytes."],
    v: "Open a one-hour recording, seek to minute 47 and confirm the first message appears in under a second with a timestamp within one chunk duration of the target.",
    dep: ["recording-container-format"]
  },
  "triggered-and-selective-recording": {
    s: "Policies that decide which topics are recorded and when, such as ring buffers that keep the last minute and save it only when a fault trigger fires.",
    d: "Always-on full recording is impossible on bandwidth-limited robots, so recorders filter by topic, by rate or by condition. A rolling buffer holds recent messages in memory and writes them out when a trigger, such as a safety stop or a manual button, fires, optionally continuing for a set time after. Rules are configured per mission. The difficulty is choosing: the data that explains a failure is rarely known in advance, and a buffer sized too small drops the cause.",
    k: ["Always record everything vs trigger-based capture: full recording never misses the cause, while triggers save storage and upload cost but can miss unanticipated faults.", "In-memory ring buffer vs on-disk rolling segments: memory is fast and cheap on the disk, but lost on a crash or power cut, which is when it matters most."],
    p: ["The trigger fires on the stop event, but the buffer holds only five seconds and the cause began thirty seconds earlier.", "Omitting transform topics from a selective recording makes the saved data unusable in a viewer."],
    v: "Set a 30 second buffer, run normally, fire the trigger, and confirm the saved file covers the 30 seconds before the trigger and the configured seconds after, including the transform topics.",
    dep: ["recorder", "history-and-depth"]
  },
  "playback-engine": {
    s: "The component that reads a recording and republishes its messages at their original pace, or faster or slower, optionally driving the simulated clock so nodes experience the original timeline.",
    d: "The player reads messages in time order, sleeps until each one's recorded offset from the start, and publishes it with the same type and, where possible, a compatible policy. It can loop, pause, step, remap names and publish a clock topic so subscribers in simulated-time mode follow recorded time. The challenge is faithfulness: nodes under test must not see live and replayed data mixed, timing is only as good as the player's sleeps, and some policies cannot be reproduced exactly.",
    k: ["Playback paced by the recording vs as fast as possible: paced replay behaves like the robot, while fast replay speeds tests but breaks any node that depends on real timing.", "Player publishes a clock vs nodes keep wall time: a clock makes replay deterministic, but every node must be configured to follow it."],
    p: ["Replaying a recording with live sensors still running mixes two realities into the same topics.", "Nodes using wall time stamp their output with the present while input carries past stamps, so transforms fail to match."],
    v: "Replay a recording at half speed with the clock enabled and confirm that a node's output stamps stay within one period of the recorded input stamps and that a tool shows the clock advancing at half rate.",
    dep: ["recording-container-format", "indexing-and-seek", "simulated-and-replayed-time", "topics-and-publishers"]
  },
  "simulator-bridge": {
    s: "The adapter that carries simulated sensor readings into the middleware's topics and carries actuator commands back into the simulator, so the robot's code cannot tell it is not hardware.",
    d: "The simulator holds a model of the world and robot. The bridge maps each simulated sensor to a topic with the right type, frame and timestamp, and maps each command topic to a simulated actuator. It forwards the simulator's clock. Its quality decides whether results transfer to the real robot. It is hard because the simulator runs at its own step rate, possibly slower than real time, and its sensors are too clean unless noise and latency are added deliberately.",
    k: ["A thin bridge that mirrors hardware topics vs simulation-specific topics: mirroring lets the same launch files run both, but hides differences that matter on real hardware.", "Simulator stepping on demand vs free-running: on-demand stepping keeps nodes and physics in sync and reproducible, at the cost of speed and extra coordination."],
    p: ["A free-running simulator and nodes on wall time drift apart, so tests pass or fail depending on the machine speed.", "Perfect simulated sensors hide failures that noise and dropouts would expose on the real robot."],
    v: "Run the full navigation stack unchanged in the simulator, command a goal, and confirm the simulated robot reaches it with the same topic names and frame ids as the hardware launch uses.",
    dep: ["simulated-clock-integration", "topics-and-publishers", "sensor-and-actuator-models", "message-timestamps"]
  },
  "simulated-clock-integration": {
    s: "Publishes the simulator's time as the system clock source, so every node, timer and transform lookup follows simulated time and can run faster or slower than real time.",
    d: "The simulator publishes a clock topic on every step. Nodes configured to use simulated time ignore the system clock and read this value for stamps, timers and sleeps. Timers fire when simulated time advances. Pausing the simulator pauses all timers consistently. The difficulty is coverage: any node or library that reads the wall clock directly breaks the model, and nodes started before the first clock message arrive have no time yet.",
    k: ["A clock topic read by every node vs a shared clock service: a topic needs no extra machinery, but gives coarse granularity, set by the step size, for timers and rates.", "Simulated time as a per-node setting vs a global switch: per-node settings are flexible, and easy to get wrong in one node out of fifty."],
    p: ["One node left on wall time stamps messages with the present, and transform lookups in other nodes fail with extrapolation errors.", "A simulator step much larger than a node's period makes timers fire in bursts."],
    v: "Pause the simulator for ten seconds and confirm that no timer-driven node publishes during the pause and that stamps resume from the paused time, not from the wall clock.",
    dep: ["node-clock", "simulated-and-replayed-time", "timer-and-sleep-semantics"]
  },
  "sensor-and-actuator-models": {
    s: "Software models of cameras, lidar, inertial units, wheels and joints that generate readings and respond to commands with realistic noise, latency, limits and dynamics.",
    d: "Each model takes the true simulated state and produces a reading with calibrated noise, bias, dropouts and delay. Actuator models enforce torque, speed and acceleration limits and add response lag. Models are configured from the same robot description as the real robot, with the same frame names. Their fidelity determines how much simulation results mean. The difficulty is that real failures, such as lidar returns off glass or wheel slip, are the cases engineers most want to test and the hardest to model.",
    k: ["High-fidelity physical sensor models vs simple ideal models: fidelity exposes realistic failures, but costs simulation speed and calibration effort that many tests do not need.", "Noise injected in the model vs injected by a node in the pipeline: model noise is realistic per sensor, while a pipeline node is easy to switch on and off per test."],
    p: ["Tuning a controller against noise-free sensors produces gains that oscillate on the real robot.", "Model frame names differ from the hardware's, so the same launch file works in one and not the other."],
    v: "Compare a recorded real lidar scan against the simulated scan of the same room and confirm range noise statistics and dropout rate agree within the stated tolerance.",
    dep: ["robot-description-model", "message-timestamps"]
  },
  "world-and-scenario-description": {
    s: "Files that describe the simulated environment, obstacles, moving actors and test scenarios, so the same situation can be reproduced exactly in every test run.",
    d: "A world file lists static geometry, lights, surfaces and spawn points. A scenario adds scripted events, such as a pedestrian crossing at a set time, plus pass and fail conditions. Runs can be parameterized and randomized with a recorded seed. Used in continuous testing, these files become the regression suite for behavior. They are hard because worlds grow large, physical properties like friction need measurement, and a scenario that is not seeded and deterministic cannot reproduce its own failures.",
    k: ["Hand-authored scenarios vs randomized generation: hand-authored cases are readable and cover known hazards, while randomization finds surprises but needs a recorded seed to reproduce them.", "Detailed world meshes vs simplified collision geometry: detail helps camera realism, and simple collision shapes keep physics stable and fast."],
    p: ["A randomized test fails once and its seed was not saved, so the failure cannot be reproduced.", "Two worlds that look identical differ in friction, so the controller behaves differently."],
    v: "Run the same scenario file twice with one seed and confirm both runs produce byte-identical recordings of the key topics. Run with a different seed and confirm the positions of the randomized actors change.",
    dep: ["simulator-bridge", "simulated-clock-integration"]
  },
  "hardware-in-the-loop": {
    s: "A test setup where the real control computer and software run against simulated sensors and actuators, validating timing and integration before the robot is built or moved.",
    d: "The real control stack runs on its target computer, with its real network and drivers replaced by interfaces to a simulator on another machine. Sensor data arrives as the hardware would deliver it, over the real buses or emulated ones, and commands go back. It tests what pure simulation cannot: execution time on target hardware, driver behavior and memory use. It is hard to build and keep realistic, since the interface must reproduce bus timing, not just the messages.",
    k: ["Simulating at the message level vs at the bus level: message level is simple and fast, while bus level reproduces timing and driver behavior at the price of specialized hardware.", "Real-time simulation vs best-effort: real-time lets timing results transfer, but limits model complexity to what completes each step on time."],
    p: ["A simulator that cannot finish each step on time injects jitter that is mistaken for a bug in the target software.", "Interfaces differ subtly from real hardware, so bugs in the driver survive until the first real power-on."],
    v: "Run the stack on the target computer against the simulator for one hour and confirm control loop deadline misses match the real-hardware baseline, and that the same recorded fault replays to the same outcome.",
    dep: ["simulator-bridge", "driver-interface-layer", "real-time-executor-design"]
  },
  "node-abstraction": {
    s: "The unit of the robot's software: a named object with its own publishers, subscriptions, services, parameters and clock, usually responsible for exactly one job.",
    d: "A node registers itself with discovery under a name and namespace and owns a set of endpoints. It may run as its own process or share a process with others. Nodes are meant to be small, replaceable and restartable, so a camera driver crashing does not take down the planner. Their boundaries are the main architectural decision: too fine and the cost of message passing dominates, too coarse and a fault in one part takes down the rest.",
    k: ["Many small nodes vs few large ones: small nodes isolate faults and are reusable, but each hop adds latency and serialization cost.", "One process per node vs several nodes per process: separate processes isolate crashes, while shared processes allow zero-copy handoff and lower overhead."],
    p: ["Two nodes with the same name in the same namespace confuse the graph and break parameter and service lookups.", "Splitting a tightly coupled control loop across nodes adds jitter it did not need."],
    v: "Start a node, list the graph, and confirm it appears once with its endpoints. Start a second node with the same name and confirm the system warns about the duplicate name.",
    dep: ["client-library-api", "participant-discovery", "namespaces-and-remapping"]
  },
  "client-library-api": {
    s: "The language-specific programming interface in which engineers write nodes: creating publishers, subscriptions, services, timers and parameters, and spinning to process callbacks.",
    d: "Each supported language has a client library with idioms natural to it, built on a shared core. The API hides discovery, serialization and transport behind object creation calls. It defines ownership of messages, threading rules for callbacks and how errors surface. Keeping libraries behaviorally identical across languages is hard, because subtle differences in callback ordering, default policies or timing show up as bugs only when two languages interoperate.",
    k: ["Idiomatic per-language API vs one uniform API everywhere: idiomatic feels natural to each engineer, but behavior and documentation drift apart between languages.", "Callbacks vs async futures for services: callbacks are simple and match the executor model, while futures compose better but invite blocking calls inside callbacks."],
    p: ["Calling a blocking service inside a callback on a single-threaded executor deadlocks the node.", "A default in one language library differs from another and the two nodes silently fail to match."],
    v: "Run an equivalent publisher in one language and a subscriber in another and confirm all messages arrive with identical field values, ordering and policy behavior across a service call and a topic.",
    dep: ["language-neutral-core", "executor", "node-abstraction"]
  },
  "language-neutral-core": {
    s: "A shared core library exposing node, endpoint and clock operations through a stable low-level interface, on which every language client library is a thin layer.",
    d: "The core implements the logic that must be identical everywhere: endpoint creation, name resolution, parameter handling, timers, clocks, wait sets and the interface to the transport. Language libraries call it through bindings. It keeps behavior consistent and lets a new language be supported by writing only bindings. Its interface must be stable, since every language depends on it, and it must work with the allocation limits of real-time and embedded users, which restricts what it may do.",
    k: ["A shared core vs a full implementation in each language: shared core keeps behavior identical and cheap to maintain, but every binding layer adds a copy of the data crossing it.", "A transport-neutral core interface vs a core tied to one transport: neutral lets users swap transports, with a lowest-common-denominator interface limiting special features."],
    p: ["A change to the core interface breaks every language library at once.", "Binding layers copy large messages across the language boundary, so a camera topic costs far more than in the transport."],
    v: "Build two language libraries against one core version, run the same wait-set and timer test in both, and confirm the same number of callbacks fire at the same ordering and period.",
    dep: ["transport-abstraction", "node-clock", "timer-and-sleep-semantics"]
  },
  "executor": {
    s: "The scheduler inside a node that decides which ready callback, from subscriptions, timers and services, runs next and on which thread.",
    d: "The executor waits on all the node's endpoints, collects those with work ready, and invokes callbacks in an order determined by its policy, on one thread or a pool. Single-threaded executors guarantee callbacks never overlap. Multi-threaded executors raise throughput but need explicit mutual exclusion. Its policy affects latency: one long callback blocks every other callback, including a safety-critical timer, behind it. The difficulty is that scheduling order is rarely documented, and can starve some endpoints.",
    k: ["Single-threaded executor vs multi-threaded: single-threaded avoids data races by construction, while multi-threaded prevents one slow callback from blocking the rest at the cost of locking.", "Round-robin over ready work vs priority-ordered: round-robin is fair and simple, but gives no deadline to the callback that needs one."],
    p: ["A 200 ms callback delays a 10 ms control timer, which is seen as jitter in the actuator.", "Callbacks sharing state on a multi-threaded executor race without locks and corrupt it rarely and unpredictably."],
    v: "Add a callback that sleeps 200 ms next to a 100 Hz timer and confirm the timer's measured period on a single-threaded executor stretches, then shrinks back to 10 ms after moving them to separate callback groups.",
    dep: ["callback-groups", "language-neutral-core", "thread-priorities-and-affinity"]
  },
  "callback-groups": {
    s: "Named sets of callbacks within a node that declare which may run in parallel and which must never overlap, giving the executor its concurrency rules.",
    d: "A mutually exclusive group allows only one of its callbacks to run at a time, and a reentrant group allows any to run concurrently. Callbacks are assigned to groups when endpoints are created, and groups can be bound to different executors or threads. This lets a node isolate a time-critical timer from a slow service handler. It is hard because the model is invisible in code: a default group quietly serializes everything, and a wrong assignment creates either a deadlock or a data race.",
    k: ["Mutually exclusive groups vs reentrant groups: exclusive groups protect shared state without locks, while reentrant groups give parallelism and require thread-safe handlers.", "A group per executor thread vs one shared group: per-thread groups bound latency for critical callbacks, with more configuration to maintain."],
    p: ["A service call made from a callback in the same exclusive group as the service handler never completes.", "Assuming the default is reentrant, an engineer writes unlocked shared state and races under load."],
    v: "Put a slow service handler and a control timer in separate groups on a two-thread executor and confirm the timer keeps its period while a long service call is in progress.",
    dep: ["executor", "client-library-api"]
  },
  "timers-and-rates": {
    s: "Periodic triggers and rate controls that run callbacks at fixed intervals, driving control loops and publishers from the node's clock rather than from message arrival.",
    d: "A timer is created with a period, and the executor fires its callback each time the clock passes the next deadline. Timers follow the node's clock, so they obey simulated time. A rate helper sleeps the remainder of a period. Timers are where control loops live. They are hard because a late callback does not make up lost ticks by default: the timer may skip or fire back to back, and wall-clock jumps change what a period means.",
    k: ["Timer callbacks vs a blocking loop with a sleep: timers integrate with the executor and simulated time, while a loop is simple but blocks other work in its thread.", "Catching up missed ticks vs skipping them: catching up preserves average rate but produces bursts, and skipping keeps timing smooth with lost work."],
    p: ["A callback that runs longer than its period silently halves the actual rate.", "A timer on the wall clock jumps when the system time is adjusted, firing a burst of stale ticks."],
    v: "Run a 100 Hz timer for a minute under CPU load and record the actual periods. Confirm the mean is 10 ms and the 99th percentile stays within the stated jitter bound.",
    dep: ["node-clock", "executor", "timer-and-sleep-semantics"]
  },
  "composition-and-intra-process": {
    s: "Loading several nodes into one process as components, so they share an executor and can pass messages by pointer without serialization or copying.",
    d: "Nodes are built as loadable components and a container process instantiates them from a launch description at run time. Inside one process, a publisher hands a subscriber the same buffer when ownership allows, skipping the network stack. It cuts latency and CPU for image and point cloud pipelines. The tradeoffs are fault isolation and visibility: one crash takes down every component, and messages passed by pointer are invisible to recorders unless a copy is also published.",
    k: ["Composed nodes in one process vs separate processes: composition gives zero-copy and lower latency, while separate processes limit a crash and a memory leak to one node.", "Unique ownership handoff vs shared immutable messages: unique handoff is cheap with a single consumer, while many consumers force a copy or immutability."],
    p: ["Messages delivered by pointer never reach the network, so a recorder or remote tool sees nothing from a composed pipeline.", "A subscriber modifies a message that is shared with others, corrupting what they read."],
    v: "Compose a camera node and a processing node in one process, measure end-to-end latency and CPU against two processes, and confirm the composed version is lower and the process memory shows no per-frame copies.",
    dep: ["intra-process-delivery", "executor", "launch-descriptions", "loaned-and-zero-copy-messages"]
  },
});
