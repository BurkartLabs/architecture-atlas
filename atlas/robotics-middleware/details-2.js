// Details for the robotics middleware plate, part 2: launch, communication patterns, messages, transforms.
ATLAS.details("robotics-middleware", {
  "launch-descriptions": {
    s: "Declarative or scripted files that list which nodes to start, with which parameters, names and connections, so a whole robot configuration starts from a single command.",
    d: "A launch description is a tree of actions: start a process, include another description, set a parameter, group nodes under a namespace, or register an event handler. It is evaluated by a launch service that spawns processes and watches them. Descriptions are composed, so a robot launch includes a driver launch and a navigation launch. The difficulty is that they grow into programs with conditions and arguments, and an error in the composition shows up only as a node missing or misconfigured at runtime.",
    k: ["Static declarative files vs launch as code: declarative is easy to read and validate, while code handles conditions and loops but can hide what will actually start.", "One top-level launch for the robot vs many small launches: one file gives a single entry point, and small ones let engineers test a subsystem alone."],
    p: ["An argument default differs between included files and the intended value is silently overridden.", "Nodes start in no guaranteed order, so one that needs another's service fails on first call."],
    v: "Start the full launch on a clean machine, list the graph, and confirm every expected node, remapping and parameter value is present, compared with a stored expected-graph snapshot.",
    dep: ["substitutions-and-conditions", "process-supervision", "namespaces-and-remapping", "parameter-system"]
  },
  "substitutions-and-conditions": {
    s: "Placeholders and conditionals in launch files that are resolved at start time from arguments, environment, file locations or other values, so one description serves many robots.",
    d: "Instead of fixed text, a launch field can hold a reference such as an argument, an environment variable, a package path or a computed expression. Conditions include or skip nodes according to values such as simulation mode or robot model. Resolution happens when the action executes, not when the file is read. It is the mechanism that lets one description cover hardware and simulation. It is hard because errors surface late, as a path that does not exist or a condition that silently excludes a node.",
    k: ["Late resolution at execution vs early validation at load: late resolution allows values known only at start, while early validation catches mistakes before anything runs.", "Conditionals in one file vs separate files per variant: conditionals avoid duplication, but obscure which configuration actually runs."],
    p: ["A boolean passed as the string false is treated as true, so the simulation-only node starts on the real robot.", "A substitution referring to an unset variable resolves to an empty string and produces a plausible but wrong path."],
    v: "Launch twice, once with simulation true and once false, dump the resolved node list and parameters for each, and confirm the differences are exactly the intended ones.",
    dep: ["launch-descriptions"]
  },
  "process-supervision": {
    s: "The launch service's job of starting processes, watching their exit and output, restarting failed ones by policy, and shutting everything down in an orderly way.",
    d: "The supervisor forks each node as a child, captures logs, and reacts to exit events by restarting, shutting down the group or ignoring. On shutdown it signals children, waits, then forces termination. Respawn policies handle transient failures such as a driver losing a device. It is hard because restarting a node is not the same as recovering: state is lost, peers must rediscover, and a node that crashes at startup restarts in a loop that fills disks with logs.",
    k: ["Automatic respawn vs fail and stop: respawn keeps the robot useful through transient faults, but can mask a real bug and loop on a deterministic crash.", "A launch-level supervisor vs the operating system's service manager: the launch service knows the graph, while the system manager survives its own crashes and starts on boot."],
    p: ["A node that crashes immediately respawns in a tight loop, filling the log disk and hiding the first error.", "The supervisor itself dies and leaves orphaned nodes running that a restart then duplicates."],
    v: "Kill a driver node with a signal and confirm the supervisor restarts it within the configured delay, the graph shows it reappear, and downstream nodes resume. Kill it repeatedly and confirm respawn backs off.",
    dep: ["launch-descriptions", "managed-node-states", "failure-containment"]
  },
  "managed-node-states": {
    s: "A defined state machine for nodes, with unconfigured, inactive, active and finalized states and explicit transitions, so startup and shutdown can be ordered and verified.",
    d: "A managed node does not start working at construction. It is configured, which allocates resources and opens devices, then activated, which begins publishing and acting. Deactivation and cleanup reverse this. A coordinator can drive a whole group through the transitions, in dependency order, and learn which node failed. Transition callbacks return success or failure. It is hard because every node must implement the contract consistently, and an error during activation must leave the rest in a safe state.",
    k: ["Managed nodes with explicit states vs plain nodes that start immediately: managed nodes give deterministic bringup and graceful degradation, with more code and a coordinator to maintain.", "Fail the whole group on one failed transition vs continue degraded: failing the whole group is safe, while continuing keeps partial function that may be unsafe."],
    p: ["A node activates before the sensor it depends on is configured, and publishes stale or empty data.", "An activation callback blocks on hardware and the coordinator waits forever with no timeout."],
    v: "Drive a group of nodes through configure and activate in dependency order, confirm each publishes only after activation, then deactivate and confirm publishing stops and devices are released.",
    dep: ["node-abstraction", "process-supervision"]
  },
  "namespaces-and-remapping": {
    s: "Prefixes that group a node's names under a robot or subsystem, and remapping rules that rename an endpoint at launch so unmodified nodes can be wired together.",
    d: "Every topic, service and node name lives in a namespace. A relative name is resolved against the node's namespace, and an absolute name is not. A remap rule replaces a name when the node starts, which lets one node's output feed another's input without editing code, and lets several robots share one network. It is hard because relative and absolute names, private names and remaps interact, and a mistaken rule produces a node that is running and publishing to the wrong topic.",
    k: ["Namespace per robot on a shared network vs one domain per robot: namespaces share a graph and allow cross-robot tools, while separate domains isolate fully with fewer ways to interfere.", "Remapping at launch vs changing code names: remapping keeps nodes reusable, while code changes make wiring visible in source and diffs."],
    p: ["A node uses an absolute name where a relative one was intended and escapes its robot's namespace.", "A remap matches nothing because the name is spelled before resolution, and no error is reported."],
    v: "Start two instances of the same node under different namespaces and confirm each publishes to its own topic. Then remap one output and confirm the subscriber receives from the remapped name.",
    dep: ["graph-names-and-resolution", "node-abstraction"]
  },
  "parameter-system": {
    s: "A typed, per-node key-value store for configuration that can be set at launch or changed at runtime, with change notification and validation hooks.",
    d: "Each node declares its parameters with a type, default and optional range. Values come from launch files, YAML files or remote calls, and the node is notified on change and may reject a value. Parameters are exposed by services so tools can list and set them for any node. They carry gains, thresholds, topic names and frame ids. The hard parts are consistency, since several nodes may need the same value, and accountability, because a runtime change leaves no record unless logged.",
    k: ["Declared typed parameters vs free-form undeclared ones: declaration catches misspelled names and wrong types, while undeclared parameters are quick but fail silently.", "Runtime-changeable parameters vs read at startup only: runtime change enables live tuning, but each parameter must be safe to change mid-operation."],
    p: ["A misspelled parameter name in a file is ignored and the node runs with the default.", "A tuned value changed through a tool is lost at the next restart because it was never saved to the file."],
    v: "Change a controller gain on a running node through the parameter service, confirm the behavior changes without a restart, and confirm an out-of-range value is rejected with an error.",
    dep: ["services", "node-abstraction"]
  },
  "topics-and-publishers": {
    s: "A named, typed channel to which any number of nodes publish messages and from which any number subscribe, decoupling producers from consumers in time and identity.",
    d: "A publisher declares a topic name, message type and policy, and sends messages without knowing who reads them. Discovery matches it to subscribers, and the transport delivers a copy to each. It suits streams such as sensor data, state and commands. Producers and consumers can come and go. The difficulty is that no one is told whether anyone received anything: slow subscribers drop or queue data by policy, and a missing subscriber produces no error.",
    k: ["Fire-and-forget publishing vs acknowledged delivery: fire-and-forget keeps producers independent and fast, while acknowledgments give certainty and couple the producer to its slowest reader.", "Many-to-many topics vs point-to-point queues: topics suit shared data, while a queue assigns each message to one consumer and fits work distribution."],
    p: ["Two publishers on one command topic interleave commands and the actuator receives conflicting values.", "A publisher with no matching subscriber appears healthy, so a wiring error is not noticed until something fails."],
    v: "Publish at 50 Hz to a topic with two subscribers and confirm both receive every message in order. Add a third subscriber mid-run and confirm it starts receiving without the publisher changing.",
    dep: ["node-abstraction", "endpoint-matching", "serialization-format", "reliability-policy"]
  },
  "subscriptions-and-callbacks": {
    s: "The receiving side of a topic: a declared interest in a name and type, with a queue of incoming messages and a callback invoked by the executor for each one.",
    d: "A subscription matches publishers by name, type and policy. Incoming messages are deserialized, placed into a bounded queue of the configured depth, and passed to the callback when the executor takes them. The callback receives a message that may be shared or owned. Depth, ordering and the behavior on overflow are policy choices. The difficulty is that a slow callback makes the queue overflow, and the oldest messages are dropped without any error visible to the code.",
    k: ["Deep queue vs depth of one: a deep queue absorbs bursts and loses nothing, while depth one always processes the newest data, which is right for state and wrong for events.", "Processing in the callback vs handing off to a worker: inline processing is simple and ordered, while a handoff keeps the executor free at the price of extra buffering."],
    p: ["A callback that takes longer than the publishing period lets the queue fill and the node acts on stale data.", "Storing a pointer to the message after the callback returns reads memory that has been reused."],
    v: "Publish 1000 numbered messages at 100 Hz to a callback that takes 20 ms and confirm, with depth 10, the receiver sees a gap pattern and reports drops, while with a fast callback it sees all 1000.",
    dep: ["topics-and-publishers", "executor", "history-and-depth"]
  },
  "services": {
    s: "A request and response call to a single named server, used for quick questions and configuration, such as setting a parameter or asking a node to reset.",
    d: "A server node advertises a service with a request type and a response type. A client sends a request, a matching identifier ties the response to it, and the client waits asynchronously or blocks. Services suit operations that finish in milliseconds. A service is not a good fit for work that takes seconds or needs cancellation. The difficulty is failure: if the server is absent the call hangs unless a timeout is set, and a server that crashes mid-request never answers.",
    k: ["Services for short operations vs actions for long ones: services are simple and cheap, while actions add feedback and cancellation at the price of more machinery.", "Blocking client calls vs asynchronous: blocking is easy to read, but can deadlock an executor, and asynchronous needs more code to handle late responses."],
    p: ["A client calls a service before the server has started and waits indefinitely because no timeout was set.", "A service handler that takes seconds blocks the executor thread and delays every other callback in the node."],
    v: "Call a service with the server running and confirm the response arrives within the stated latency. Stop the server, call again with a one-second timeout, and confirm the client reports a timeout rather than hanging.",
    dep: ["node-abstraction", "serialization-format", "endpoint-matching"]
  },
  "actions": {
    s: "A pattern for long-running goals: a client sends a goal, receives periodic feedback, can cancel, and gets a final result, with each step carried over services and topics.",
    d: "An action server accepts or rejects a goal, runs it, publishes feedback on a topic, and returns a result when done. The client holds a goal handle used to cancel or to wait for the result. Navigation to a point, a gripper closing, and an arm trajectory are actions. Under the surface it is a bundle of services and topics with a shared goal identifier. It is hard to implement correctly: every state, such as accepted, canceling, aborted and succeeded, must be handled.",
    k: ["Action with feedback vs service plus polling: actions give a standard progress and cancel protocol, while polling needs custom code in each pair.", "Server runs one goal at a time vs several concurrently: one goal is simple and safe for a single arm, while concurrency is needed for fleets of requests at the price of resource arbitration."],
    p: ["A client disconnects and the server keeps executing a goal nobody wants, because it never checked cancellation.", "A server reports success when the goal was only issued, not achieved, and the caller proceeds."],
    v: "Send a goal that takes ten seconds, confirm feedback arrives about once a second, cancel at five seconds and confirm the server stops within its stated limit and the client sees a canceled result.",
    dep: ["services", "topics-and-publishers", "action-cancel-and-preempt"]
  },
  "action-cancel-and-preempt": {
    s: "The rules for stopping or replacing a running goal: how a client requests cancel, how a server accepts or refuses, and what happens when a new goal arrives during an old one.",
    d: "A cancel request names a goal or a time range of goals. The server decides whether to accept it, stops the work, and reports a canceled result. A server may also preempt, replacing an active goal with a new one by policy. Cancel is a request, not a command: the server must poll for it and wind down safely, for example by stopping a robot arm at a safe pose. It is hard because motion cannot always stop instantly and a late cancel races the completion.",
    k: ["Preempt on new goal vs reject while busy: preempting keeps the robot responsive to the latest command, while rejecting protects a long operation that should not be interrupted.", "Cancel as an instant stop vs a controlled wind down: instant is simple but can be unsafe for moving hardware, and wind down needs more time and logic."],
    p: ["A cancel arrives just as the goal succeeds, and the client sees success but treats it as canceled.", "A server that never polls for cancel keeps driving the motors after the operator pressed stop."],
    v: "Cancel a running motion goal and measure the time to a stopped robot, confirming it is within the stated stop distance. Then send a second goal during a first and confirm the configured preempt or reject behavior.",
    dep: ["actions", "failure-containment"]
  },
  "message-filters-and-sync": {
    s: "Utilities that combine several topics into one callback, matching messages by timestamp, such as pairing a camera image with the nearest lidar scan or inertial reading.",
    d: "Sensors publish independently at different rates and with different delays. A synchronizer buffers messages from each input and calls the user's callback when it finds a set whose stamps match exactly or within a tolerance. Other filters cache history for a time window or wait for a transform to become available before delivering. It is hard because the matching policy decides everything: a tolerance that is too strict yields no output, and one too loose pairs data from different moments.",
    k: ["Exact-time matching vs approximate matching within a tolerance: exact is correct when hardware triggers sensors together, while approximate is needed for independent sensors and adds an error.", "Buffering to wait for the slowest input vs dropping late data: waiting yields complete sets with added latency, dropping keeps latency low and loses samples."],
    p: ["A fixed buffer fills while one sensor is silent, and the output of the others is delayed until it overflows.", "Using arrival time instead of header stamps pairs messages from different moments."],
    v: "Feed two streams with known stamp offsets of 5 ms and a tolerance of 10 ms and confirm every pair is delivered. Widen the offset to 20 ms and confirm no pair is delivered and a drop is reported.",
    dep: ["subscriptions-and-callbacks", "message-timestamps", "transform-buffer-and-lookup"]
  },
  "graph-names-and-resolution": {
    s: "The naming scheme for nodes, topics, services and actions, including absolute, relative and private names, and the rules that turn a name used in code into a unique graph name.",
    d: "A name is a slash-separated path. Names starting with a slash are absolute, those without are relative to the node's namespace, and private names are relative to the node itself. Resolution applies the namespace, then remapping rules, and checks the result against allowed characters. The final names are what discovery advertises. It is hard because the code, the launch file and the tool each see a different form of the same name, and conventions differ between teams.",
    k: ["Hierarchical names vs flat identifiers: hierarchy supports grouping, wildcards and per-robot isolation, while flat identifiers are simpler and give no organizing structure.", "Resolution at node creation vs on each use: at creation it is fast and fixed, while on each use allows dynamic renaming at some cost."],
    p: ["Two engineers use different spellings of the same topic, one with a leading slash, and the data never meets.", "A name with an invalid character is accepted by one language library and rejected by another."],
    v: "Create a node in a namespace and a publisher with a relative, an absolute and a private name, then list the graph and confirm each resolves to the expected full name.",
    dep: ["namespaces-and-remapping"]
  },
  "interface-definition-language": {
    s: "A small, language-neutral notation for describing message, service and action types as named, typed fields, with constants, defaults, bounded arrays and nested types.",
    d: "Each type is a text file listing fields with primitive or nested types, array bounds and optional defaults. Services have a request and a response section, and actions have goal, result and feedback. These files are the contract between teams and between languages. Bounded fields allow fixed-size, allocation-free messages for real-time use. The hard part is design: a type is easy to write and costly to change, and fields that mix units, frames or meanings cause bugs across the whole fleet.",
    k: ["Many small specific types vs a few general types with optional fields: specific types are clear and checkable, while general ones reduce the type count and make meaning ambiguous.", "Bounded and fixed-size fields vs unbounded: bounded fields avoid allocation at run time, while unbounded fields are flexible and require dynamic memory."],
    p: ["A field named distance with no unit is read as meters by one team and millimeters by another.", "An unbounded string field in a message that a real-time node publishes triggers allocation in the control loop."],
    v: "Define a nested type with a bounded array, generate code for two languages, populate it in one and read it in the other, and confirm every field, including the maximum-length array, round-trips unchanged.",
    dep: ["code-generation", "type-identity-and-versioning"]
  },
  "code-generation": {
    s: "The build step that turns each definition file into data structures, serialization functions and type support in every client language, kept in sync by regenerating from one source.",
    d: "A generator parses the definition files, resolves nested types and dependencies, and emits per-language source: structures, constructors, converters to the wire format, and a type description used by tools. It runs inside the build system, so interface packages build before the code that uses them. It is hard because of build ordering and size: large interface sets slow every build, and a generator bug affects every language at once.",
    k: ["Generating at build time vs interpreting definitions at run time: build-time generation is fast and type safe, while run-time interpretation lets tools handle unknown types without rebuilding.", "One shared intermediate form vs a separate generator per language: one form keeps languages consistent, and per-language generators can produce more idiomatic code."],
    p: ["A stale generated package is used after a definition changes and the two ends disagree on the layout.", "Interface packages in a dependency cycle make the whole workspace fail to build with errors far from the cause."],
    v: "Change a field in a definition, rebuild, and confirm that code in every language sees the new field and that a node built against the old version is reported as a type mismatch rather than accepted.",
    dep: ["interface-definition-language", "serialization-format"]
  },
  "serialization-format": {
    s: "The encoding that turns a message into bytes for the wire and a recording, with a defined byte order, alignment and layout so any implementation can decode it.",
    d: "A typed message is written field by field in a standard encoding, with headers saying the representation, and read back using the type's description. Common choices are compact binary encodings with fixed alignment rules. Some formats allow reading fields in place without a decode step. Cost matters on large messages: images and clouds dominate bandwidth, and encoding time shows up in latency. It is hard because both sides must agree exactly, and a layout mismatch gives garbage that still looks valid.",
    k: ["Compact binary encoding vs self-describing text: binary is small and fast and needs the schema, while self-describing is easy to debug and costs size and time.", "Decoding to native objects vs reading in place: native objects are convenient, while in-place reading avoids a copy and ties code to the wire layout."],
    p: ["Two ends built against different versions of a type decode the same bytes into different values with no error.", "Serializing a multi-megabyte message on every publish, even for a local subscriber, wastes CPU and adds latency."],
    v: "Serialize a message with every field type, including nested arrays and strings, decode it in a different language library, and compare byte-for-byte against a published reference encoding.",
    dep: ["interface-definition-language", "type-identity-and-versioning"]
  },
  "type-identity-and-versioning": {
    s: "How a message type is named and checked so that two nodes only exchange data when they agree on its exact structure, and how changes to a type are managed over time.",
    d: "A type has a name and, in stricter schemes, a hash of its full definition. Endpoints exchange this identity during matching, and a mismatch prevents a connection or raises a warning. Changing a type, such as adding a field, makes a new version. Rules and tools allow old recordings to be read with new definitions and let two versions coexist during an upgrade. It is hard because robots in a fleet are updated at different times, and one mismatch can disable a subsystem.",
    k: ["Strict hash matching vs name-only matching: hashes catch every layout difference, while name matching tolerates harmless changes and lets silent corruption through.", "Add a new message type vs extend the existing one: a new type is explicit and safe to roll out, while extension avoids duplication and breaks old readers."],
    p: ["A fleet update changes a message and half the robots stop receiving it with only a log warning.", "Old recordings cannot be read after a type changes because the schema was not stored with them."],
    v: "Run a publisher built with a changed type against a subscriber with the old type and confirm the mismatch is reported with both type names and nothing is delivered. Run it with matching types and confirm delivery.",
    dep: ["interface-definition-language", "endpoint-matching", "interface-compatibility"]
  },
  "loaned-and-zero-copy-messages": {
    s: "An allocation scheme where the transport lends the publisher a buffer to build the message in, so the same memory reaches subscribers without serialization or copying.",
    d: "Instead of constructing a message on the stack and copying it, the publisher asks the middleware for a loan, fills it in place, and returns it. For shared memory, the buffer sits in a region mapped by all readers, and only a small reference is sent. It suits large fixed-size messages such as images. It requires plain, fixed-size types with no pointers, and careful handling of lifetime: a buffer must not be reused until every reader has released it.",
    k: ["Loaned fixed-size buffers vs ordinary dynamic messages: loans eliminate copies and allocation, while dynamic messages allow variable length and work over any transport.", "Reference counted release by readers vs timeout reclaim: reference counting is exact, and a stuck reader holds memory, while timeout reclaim bounds memory and can free data still in use."],
    p: ["A slow reader keeps references and the publisher runs out of loanable buffers.", "A message type with a dynamic string cannot be loaned, and the code silently falls back to the copying path."],
    v: "Publish 4 MB images at 30 Hz to a local subscriber with loaning and measure CPU and latency against ordinary publishing. Confirm lower CPU and that the subscriber's pointer lies in the shared region.",
    dep: ["shared-memory-transport", "allocation-discipline", "message-copying-and-ownership"]
  },
  "transform-tree": {
    s: "A time-indexed tree of coordinate frames, each stored as a pose relative to its parent, so the position of any part of the robot or world can be found in any other frame.",
    d: "Every frame has exactly one parent, forming a tree rooted in a world or map frame. Each edge holds a translation and a rotation that changes over time. To relate two frames, the system walks up to a common ancestor and composes the poses. The tree structure forbids loops and ambiguity. Typical frames are the map, the odometry origin, the robot base and every sensor. It is hard because several estimators want to own the map-to-odometry edge, and each frame needs exactly one source.",
    k: ["A tree with one parent per frame vs a general graph of constraints: a tree gives unique, fast lookups, while a graph can fuse redundant measurements but needs an optimizer.", "Separate map and odometry frames vs one world frame: separate frames keep short-term motion smooth and let global corrections jump, while one frame hides the jump and is simpler."],
    p: ["Two nodes publish the same child frame with different poses and the frame flickers between them.", "Reparenting a frame at runtime orphans a subtree, and lookups through it start failing."],
    v: "Publish a chain of three frames with known offsets and confirm a lookup from the leaf to the root returns the composed pose to numerical precision, and that adding a second parent for one frame is reported as an error.",
    dep: ["transform-broadcasting", "transform-buffer-and-lookup", "robot-description-model"]
  },
  "transform-broadcasting": {
    s: "The publication of frame relationships as messages on dynamic and static transform topics, so every node can build the same tree from one shared stream.",
    d: "Whichever node knows a relationship publishes it: a state publisher derives link poses from joint values, an odometry node publishes the odom-to-base edge, a localizer the map-to-odom edge. Messages carry parent, child, timestamp and pose. Rates are typically tens to hundreds of hertz. A broadcaster should send with a timestamp equal to the measurement time. It is hard because transforms are high-frequency traffic seen by every node, and a late or wrongly stamped broadcast breaks every consumer.",
    k: ["Broadcast all transforms on shared topics vs per-pair requests: shared topics scale to many consumers and cost bandwidth everywhere, while requests are cheap but couple nodes.", "Stamping with measurement time vs current time: measurement time is physically right, while current time is easy and produces smeared data during motion."],
    p: ["A broadcaster stamps with the current time while data is stamped with the sensor time, so lookups fail as extrapolation.", "A localization node publishes at a low rate and consumers see the frame jump."],
    v: "Publish a moving transform at 50 Hz, subscribe in another node, and confirm all messages arrive with strictly increasing stamps equal to their measurement times and a jitter within the stated bound.",
    dep: ["transform-tree", "topics-and-publishers", "message-timestamps"]
  },
  "transform-buffer-and-lookup": {
    s: "A per-node cache of recent transforms that answers queries for the pose of one frame in another at a specific time, interpolating between samples and waiting for data that has not arrived.",
    d: "Each node listens to the transform topics and stores a history, typically ten seconds, per edge. A lookup names source frame, target frame and a time, and the buffer composes edges, interpolating between the nearest two samples. If the requested time is in the future or the frames are not connected, it fails or waits with a timeout. It is hard because lookups fail transiently at startup and during latency, and callers that ignore the exception crash or process wrong data.",
    k: ["Lookup at the message stamp vs the latest available: stamp lookups are accurate during motion and may need to wait, while latest is immediate and uses a pose from a different time.", "Interpolation vs extrapolation: interpolation is exact between samples, while extrapolation guesses into the future, and most buffers refuse it by default."],
    p: ["A message arrives before its transform, and the lookup throws, dropping a sensor reading that was valid.", "A buffer history shorter than the processing delay makes every lookup fail with data too old."],
    v: "Look up a transform at a stamp between two published samples and confirm the result equals the linear and spherical interpolation. Request a stamp after the newest sample and confirm it waits or fails by configuration.",
    dep: ["transform-tree", "transform-broadcasting", "message-timestamps"]
  },
  "static-transforms": {
    s: "Fixed relationships, such as where a sensor is mounted on the chassis, published once and kept until replaced, stored without a time history.",
    d: "Calibration produces constant poses between frames. Publishing them on a latched topic means every node, including one that starts later, receives them at once and keeps them valid for all time. Static edges avoid wasting bandwidth on values that never change and avoid needing history. They are usually defined in the robot description or a calibration file. The risk is staleness: after recalibration the old value remains in nodes that do not reload it, and a mistaken static edge is invisible because it is constant.",
    k: ["Static publication vs ordinary dynamic publication at low rate: static saves traffic and survives late joiners, while dynamic detects a dead publisher by silence.", "Calibration in the description file vs a separate calibration file: one file is simple, and a separate file lets calibration change without touching the model."],
    p: ["A sensor is remounted and recalibrated but a long-running node keeps the old static pose.", "Two nodes each publish a different value for the same static edge, and the winner depends on startup order."],
    v: "Start a node after the static transforms were published and confirm its first lookup succeeds immediately. Change a static pose, restart the publisher, and confirm all nodes see the new value.",
    dep: ["transform-tree", "durability-policy", "robot-description-model"]
  },
  "robot-description-model": {
    s: "A structured file describing the robot's links, joints, limits, masses and sensor mounts, from which transforms, visualization and simulation models are derived.",
    d: "The file lists rigid links with geometry and inertia, and joints that connect them with type, axis and limits. A state publisher combines it with joint values to broadcast every link's pose. Visualizers draw the geometry, planners read the limits, and simulators use the inertia. Because many tools read one description, it is the single source for the robot's shape. It is hard to keep it consistent with the real robot, since a wrong mass or offset passes unnoticed until a controller or planner depends on it.",
    k: ["One description for visualization, planning and simulation vs separate files per tool: one source stays consistent, while separate files allow simplified shapes for speed and drift from each other.", "Parameterized description with macros vs flat file per variant: macros avoid duplication across robot variants, and flat files are easier to read and diff."],
    p: ["Joint limits in the description differ from the real hardware limits, and a planner commands a move the motor rejects.", "Link frame names change in the description but nodes keep the old names in parameters."],
    v: "Load the description, publish joint values for a known pose, and confirm that the computed end-effector position in the base frame matches a tape measurement of the real robot in the same pose within tolerance.",
    dep: ["transform-tree", "static-transforms"]
  },
});
