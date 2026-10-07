// Details for the autonomous driving plate, part 4: vehicle interface, sensors, calibration, compute, cross-cutting.
ATLAS.details("autonomous-driving", {
  "drive-by-wire-gateway": {
    s: "Translates the controller's steering, acceleration and braking requests into the messages the vehicle's own control units accept, and enforces handshake and mode rules.",
    d: "The vehicle's steering, brake and powertrain units expose a defined command interface over the vehicle network, with counters, checksums and an enable sequence. The gateway packs requests into these messages at the required rate, manages the engage and disengage handshake, and refuses to command while the vehicle is in a state that does not permit it. It hides differences between vehicle models from the rest of the stack. It is hard because these interfaces are vendor-specific, their documentation is imperfect, and some limits are enforced silently by the vehicle.",
    k: ["Thin gateway with vehicle-specific adapters vs a generic interface: adapters isolate each model's quirks; a generic interface leaks differences into control.", "Gateway on the main computer vs on a separate safety processor: separate hardware can enforce limits during a main failure and adds a component to validate."],
    p: ["The vehicle silently ignores a request that exceeds its own limit, and the controller believes it was applied.", "A message counter fault is treated as a transient and commands stop reaching the actuators."],
    v: "Send command sequences covering engage, steady driving, disengage and invalid inputs on a bench and a test vehicle, and confirm the actuators respond as specified and reject bad messages.",
    dep: ["command-watchdog", "vehicle-state-feedback", "compute-hardware"]
  },
  "vehicle-state-feedback": {
    s: "Reads back what the vehicle actually did, such as steering angle, wheel speeds, brake pressure and gear, and publishes it as the source of truth for control and odometry.",
    d: "Feedback arrives from the vehicle network at a fixed rate, with timestamps and validity flags. The component decodes, converts to standard units, checks consistency among redundant signals, and publishes the vehicle state. Control uses it to close the loop and detect that a command was not followed. Odometry uses wheel speeds. Latency and jitter in this path directly limit control quality, and a signal that is flagged valid but wrong is hard to catch, since few signals exist in redundant form.",
    k: ["Trust vehicle-reported state vs verify with own sensors: vehicle state is accurate and cheap; independent checks catch a faulty signal and cost sensors and effort.", "Raw signals vs filtered ones: raw preserves information; filtering reduces noise and adds lag."],
    p: ["A frozen signal continues to be published with a fresh timestamp.", "A units or sign convention differs across vehicle variants, and only one model shows wrong odometry."],
    v: "Compare published steering angle and speed with an external reference during a test drive, and freeze the vehicle's signal on the bus to confirm the staleness is detected.",
    dep: ["chassis-sensors", "timestamp-alignment"]
  },
  "command-watchdog": {
    s: "Validates every outgoing command for freshness, range and consistency, and brings the vehicle to a safe stop if commands stop arriving or become implausible.",
    d: "Each command carries a sequence number and timestamp. The watchdog rejects stale or out-of-range commands, checks rate of change, and expects a continuous heartbeat. If the heartbeat is missing for longer than a short limit, it holds a safe request such as moderate braking. It lives close to the actuators, ideally on separate hardware, so it still works if the main computer hangs. The balance is between reacting fast to a hang and tolerating normal scheduling jitter without false stops.",
    k: ["Short timeout vs long timeout: short timeouts limit the time of uncontrolled driving; long ones tolerate jitter and avoid unnecessary stops.", "Hold last command vs fall back to a safe command: holding the last command is smooth for transients; a defined safe command bounds the worst case."],
    p: ["The watchdog is fed by a thread that is alive while the control logic is hung.", "A fallback braking command is too harsh at highway speed and causes a rear-end collision."],
    v: "Halt the main process during a track run at several speeds; the watchdog detects the missing heartbeat within its timeout and the vehicle decelerates to a stop at the specified rate.",
    dep: ["vehicle-state-feedback", "command-limiting", "real-time-scheduling"]
  },
  "occupant-hmi": {
    s: "The display, sounds and controls through which riders or a safety driver learn what the system is doing and ask it to do something.",
    d: "It shows the system mode, what the vehicle perceives and intends, upcoming maneuvers and alerts, and accepts destination, engage and stop requests. For a driverless service, it also handles pickup, door and emergency stop interactions. Good design builds appropriate trust: showing the detected objects and next maneuver reassures; excess detail distracts. Its mode display is safety-relevant, since a wrong or ambiguous indication of who is in control is a hazard. Accessibility, languages and behavior when the network is down all add scope.",
    k: ["Show perception detail vs minimal status: detail builds understanding and trust; it overwhelms and can expose perception errors to alarming effect.", "Physical emergency stop control vs software only: a physical control works if software fails; it can be misused and needs its own safety design."],
    p: ["The display shows the system as active while it has already degraded.", "An alert is displayed only visually and is missed by a driver looking at the road."],
    v: "With representative users, ask them to state who is in control after each of several mode changes; correct answers are given within the target time, and the emergency stop works with the main stack disabled.",
    dep: ["system-mode-manager", "world-model"]
  },
  "remote-assistance-link": {
    s: "A network connection through which remote staff can view the vehicle's situation and give high-level guidance, such as approving a path around an obstacle, without driving it directly.",
    d: "When the vehicle is stuck or unsure, it sends a summary and a subset of video and the world model to an operator, who selects among suggestions or draws a path. The vehicle checks and executes the instruction with its own safety layers. Latency and bandwidth vary, so the vehicle must never depend on the link for safety: it stays safe if the connection drops. Direct remote steering is avoided because delays and dropouts make it dangerous. Scale is a cost issue, with the ratio of operators to vehicles setting the economics.",
    k: ["Guidance commands vs direct teleoperation: guidance tolerates latency and keeps safety onboard; direct control resolves more cases and relies on a perfect link.", "Always connected vs on demand: constant connection gives quick help and costs bandwidth; on-demand saves cost and adds delay."],
    p: ["The link drops while the vehicle waits for guidance in a live lane.", "An operator approves a path that the vehicle's own checks would reject, and the vehicle freezes."],
    v: "Present the vehicle with a blocked-lane scenario and confirm that guidance arrives, is validated onboard, and completes the maneuver; cut the link mid-request and confirm a safe stop.",
    dep: ["world-model", "system-mode-manager", "vehicle-cybersecurity"]
  },
  "camera-sensors": {
    s: "Image sensors with lenses that provide color and fine detail at various fields of view, from wide for surroundings to narrow for distant objects.",
    d: "A typical vehicle has several cameras with different lenses, including wide, narrow, side and rear views. They give texture, color and signal state that other sensors lack. Dynamic range is the central issue, as a tunnel exit or low sun can blind a sensor. Image processing on the sensor sets exposure, tone and noise. Rolling shutters distort fast motion, LED lights flicker against exposure times, and cheap lenses vary between units, which is why calibration is per unit. Heating prevents fogging, and cleaning keeps them useful.",
    k: ["Few high-resolution cameras vs many lower-resolution cameras: fewer reduce cost and data; more give overlap and redundancy against a failed view.", "Global shutter vs rolling shutter: global avoids motion distortion at higher cost and noise; rolling is cheaper and needs correction."],
    p: ["Direct sun saturates the image and the vehicle effectively loses forward vision for seconds.", "A lens cracked by a stone slowly degrades detection and is not noticed."],
    v: "Image a standard chart and a high-contrast tunnel exit under controlled conditions and verify resolution, dynamic range and exposure recovery time against the specification; run a blockage test and confirm it is detected.",
    dep: ["hardware-triggering", "sensor-cleaning-and-thermal", "compute-hardware"]
  },
  "lidar-sensors": {
    s: "Laser rangefinders that measure distance to surfaces many times per second, producing a 3D point cloud independent of lighting.",
    d: "A lidar emits pulses or frequency-modulated light and measures the return to get range, in a spinning, scanning-mirror or solid-state arrangement. Output is accurate 3D geometry at night as in day, with intensity as a reflectivity hint. Range depends on target reflectivity and power limits for eye safety. Rain, snow, fog and dust scatter returns, dark objects reflect little, and interference from other lidars can add noise. Some designs also give per-point velocity. Mounting height and field of view define blind zones near the body.",
    k: ["Spinning vs solid-state units: spinning gives 360 degrees and has moving parts; solid-state is more durable and has limited field of view.", "Pulse time-of-flight vs continuous-wave measurement: time-of-flight is mature; continuous-wave adds velocity and resists interference with different complexity."],
    p: ["Heavy fog reduces effective range below the stopping distance without any fault being flagged.", "Two vehicles with the same lidar type interfere and create phantom points."],
    v: "Measure detection range for targets of known reflectivity, including dark ones, in clear air and in a rain chamber, and confirm the reported degradation matches the measured range loss.",
    dep: ["hardware-triggering", "clock-distribution", "sensor-cleaning-and-thermal"]
  },
  "radar-sensors": {
    s: "Radio-frequency sensors that measure range and relative speed directly, with long reach and good performance in rain, fog and darkness.",
    d: "Frequency-modulated radar transmits a chirp and measures frequency shifts to give range and Doppler velocity, with an antenna array giving angle. Long-range units look straight ahead, short-range units cover corners and blind spots. Radar is cheap, robust to weather and gives velocity instantly. Angular resolution is coarse, vertical resolution is limited, and metal objects create reflections. Interference from other radars in dense traffic raises the noise floor, and bumper materials and paint distort the beam.",
    k: ["Long-range narrow radar vs imaging radar: long-range is cheap and sparse; imaging radar gives dense returns and costs more data and processing.", "Radar behind the bumper vs exposed: behind is protected and degraded by material; exposed is clean and easily damaged."],
    p: ["A repaint of the bumper with metallic paint reduces range and nobody recalibrates.", "Radar interference at a busy junction masks a real target."],
    v: "Place corner reflectors and a real car at measured distances and speeds on a track, and compare reported range, speed and angle against a reference; repeat after bumper replacement.",
    dep: ["hardware-triggering", "clock-distribution"]
  },
  "gnss-receiver": {
    s: "Receives signals from navigation satellites to give a global position, velocity and time, with correction data for higher accuracy.",
    d: "A multi-constellation, multi-frequency receiver gives meters of accuracy alone and centimeters with correction data from reference stations. It also provides precise time, used to synchronize the vehicle's clocks. Signals are weak and are blocked by tunnels, reflected by buildings and can be jammed or spoofed. Receivers report quality indicators that fusion should use. Because failure is common in cities, satellite positioning is never the sole source of position for driving; it anchors the global frame.",
    k: ["Standard accuracy vs correction-assisted accuracy: standard is cheap and meters off; corrections give centimeters with a data service and slower convergence.", "Trust the receiver's quality flags vs detect errors independently: flags are free; spoofing and multipath can produce confident wrong fixes."],
    p: ["Reflections in an urban canyon produce a position that is confidently wrong by tens of meters.", "Jamming near a facility causes a total loss of fix with no warning to the planner."],
    v: "Drive an urban canyon and a tunnel with a reference system and compare reported position and quality flags; the fix is flagged degraded where error is large, and loss of signal is reported within a stated delay.",
    dep: ["clock-distribution", "vehicle-cybersecurity"]
  },
  "inertial-measurement-unit": {
    s: "Measures acceleration and rotation rate at high rate, giving smooth motion estimates between slower position updates and in places without external signals.",
    d: "Accelerometers and gyroscopes output at hundreds of hertz or more. Integrating them gives orientation, velocity and position over short times, but bias and noise make the result drift quickly. Quality ranges from low-cost devices to precise ones that can coast for minutes. Temperature affects bias, and vibration couples into the measurement. The unit is rigidly mounted with a known orientation relative to the vehicle, and its biases are estimated continuously by the localization filter.",
    k: ["Low-cost vs high-grade unit: low-cost saves money and needs frequent external corrections; high-grade bridges long outages and costs far more.", "Mounted near the center of mass vs near the sensors: center of mass simplifies the vehicle model; sensor-adjacent mounting simplifies compensation."],
    p: ["A mounting that shifts after an impact introduces a constant orientation error.", "Temperature changes bias faster than the filter tracks and drift appears after startup."],
    v: "Hold the vehicle still for several minutes and compare measured bias against specification, then drive a tunnel without satellite signal and report position drift per distance.",
    dep: ["clock-distribution", "hardware-triggering"]
  },
  "chassis-sensors": {
    s: "Wheel speed, steering angle, yaw rate, brake pressure and gear sensors that already exist in the vehicle and report its own motion and state.",
    d: "The vehicle's own sensors are accurate, cheap and robust. Wheel speed encoders give speed and distance, steering angle gives the front wheel direction, and brake pressure and pedal position give actuation state. They are read over the vehicle network, often with limited resolution and update rate and with delays. Their values depend on factory calibration. They are the primary source of ego motion at low speed and the reference for control loops, but they cannot see slip: a spinning wheel reports motion that did not occur.",
    k: ["Use the vehicle's existing sensors vs add dedicated ones: existing sensors cost nothing and come with their delays and formats; dedicated ones are faster and add integration work.", "Raw ticks vs processed speed: raw ticks give better low-speed accuracy; processed values are convenient and smoothed."],
    p: ["Low resolution of wheel speed at crawling speed causes jerky odometry during parking.", "A replaced tire with a different radius skews every distance estimate."],
    v: "Compare steering angle and wheel-speed readings against precision external measurements across the speed range, including low-speed maneuvers, and confirm resolution and latency meet the control loop's requirements.",
    dep: ["clock-distribution"]
  },
  "sensor-cleaning-and-thermal": {
    s: "Washers, heaters, covers and cooling that keep sensors clear of dirt, ice and fog and within temperature limits.",
    d: "Lenses and lidar windows are cleaned with fluid jets and air, heated to prevent ice and fog, and shielded from direct sun. Blockage detection, from image analysis or point statistics, tells the system when to clean and when to degrade. Thermal management matters because sensors and computers can exceed temperature limits in sun and cold-start poorly. The mechanical side sets how well the electronics can work. It is often neglected until a snowstorm or dusty road shows that perception is only as good as the glass.",
    k: ["Active cleaning vs passive coatings: active cleaning handles heavy contamination and uses fluid and parts; coatings are simple and fail under real dirt.", "Sensor location behind glass vs exposed: behind the windshield is cleaned by wipers and constrained; exposed gives better views and needs its own cleaning."],
    p: ["Frost builds up overnight and the vehicle starts with a partly blind sensor.", "The washer reservoir runs dry and no one is told."],
    v: "Spray a standard soiling mixture on each sensor and confirm the blockage detector flags it, the cleaning cycle restores the specified performance, and a cold-chamber start clears ice within the required time.",
    dep: ["camera-sensors", "lidar-sensors"]
  },
  "intrinsic-calibration": {
    s: "Measures each sensor's internal characteristics, such as lens distortion, focal length and lidar beam angles, so measurements convert into accurate geometry.",
    d: "For cameras, a known pattern is imaged from many angles to estimate focal length, optical center and distortion coefficients. Lidar units are calibrated for individual beam angles and range offsets. Radar calibrations cover antenna alignment. The parameters are stored per unit and applied by every consumer. Intrinsics can change with temperature and over time, particularly for lenses behind windshields, whose glass distorts the image. Wrong intrinsics bias all geometry in a way that models trained on those images may quietly learn to compensate for.",
    k: ["Factory calibration vs calibration in the field: factory is controlled and accurate; field calibration handles replacements and drift and is less precise.", "Store parameters per unit vs a nominal model: per unit is accurate and needs data management; nominal is simple and loses accuracy."],
    p: ["A replaced windshield changes distortion, and distance estimates shift by several percent.", "A camera is swapped without loading its parameters, and the stack runs with another unit's values."],
    v: "Image a calibration target at several distances and angles after calibration; reprojection error is below the specified pixel threshold, and the stored parameters match the unit's serial number.",
    dep: ["camera-sensors", "lidar-sensors"]
  },
  "extrinsic-calibration": {
    s: "Determines the position and orientation of every sensor relative to the vehicle and to each other, so their data can be placed in one frame.",
    d: "Calibration uses targets in a controlled area or natural scenes, finding the transform between each pair of sensors by matching features seen by both. Accuracy requirements are tight: at 100 meters, a half-degree of rotation error moves a point nearly a meter. Mounts can shift over time with vibration, impact or temperature. The result feeds fusion, tracking and the shared feature map. A global consistency check across all sensors is essential, because pairwise calibration can accumulate error across the chain.",
    k: ["Target-based factory calibration vs targetless field calibration: targets are accurate and need a facility; targetless is convenient and depends on scene content.", "Calibrate each sensor to the body vs pairwise: body calibration gives one consistent frame; pairwise matches overlaps better and can leave loops inconsistent."],
    p: ["A small bump moves a sensor mount, and fusion degrades gradually with no alarm.", "Calibration passes in the shop but is wrong in motion because the mount flexes."],
    v: "Project lidar points onto camera images in a scene with sharp edges; the points land on the edges within the specified pixel error, at near and far distances, after a vibration test.",
    dep: ["camera-sensors", "lidar-sensors", "radar-sensors", "intrinsic-calibration"]
  },
  "online-recalibration": {
    s: "Continuously checks sensor alignment during driving and corrects small drifts or raises a fault when a sensor has moved beyond what can be trusted.",
    d: "While driving, the system compares what overlapping sensors see, such as lane lines in camera and lidar, or the horizon and vanishing points against inertial orientation, and estimates alignment errors. Small errors are corrected, larger ones trigger degradation or a service request. It protects against slow shifts and against knocks that nobody reported. The risk is that a correction chases a perception error, and so the update rate is slow, bounded and logged. Disagreement of calibration across sensors is also evidence of a fault.",
    k: ["Auto-correct vs flag only: correction keeps performance and can mask damage; flagging is conservative and sends vehicles to service.", "Estimate from natural scenes vs special maneuvers: natural scenes are free; maneuvers give better observability and interrupt normal use."],
    p: ["Online correction absorbs a loose mount's slow movement and hides that it is failing.", "A scene with little structure produces a wrong update that damages good calibration."],
    v: "Deliberately rotate a camera mount by a known fraction of a degree on a test vehicle; the system detects the change within a stated distance, applies or flags the correction, and logs the estimated angle.",
    dep: ["extrinsic-calibration", "road-structure-perception", "inertial-measurement-unit"]
  },
  "clock-distribution": {
    s: "Gives every sensor and computer a common time reference, derived from satellite time or a network protocol, accurate to microseconds.",
    d: "A grandmaster clock, disciplined by satellite time, distributes time over the network through a precision protocol, with hardware timestamping in the network interfaces and switches. Sensors and computers adjust their clocks and report offsets. Where the satellite signal is absent, holdover from a stable oscillator keeps drift small. Everything downstream, from fusion to logging, depends on this. Faults are subtle: a slave clock that slowly diverges looks fine in logs until fused objects begin to smear, and a step change in time can break scheduling.",
    k: ["Hardware-timestamped network synchronization vs software time sync: hardware reaches microseconds; software is simple and accurate only to milliseconds.", "Single grandmaster vs redundant masters: one is simple; redundancy survives failure and needs a protocol for switching without time jumps."],
    p: ["A clock step during a satellite reacquisition makes timestamps non-monotonic and tracks break.", "One sensor falls out of sync after a reboot and is silently fused with a skewed time."],
    v: "Compare timestamps from two sensors observing the same hardware pulse, over a long drive including a satellite outage, and verify the offset stays under the specified microsecond bound and failures are reported.",
    dep: ["gnss-receiver", "compute-hardware"]
  },
  "hardware-triggering": {
    s: "Starts sensor captures from a shared electrical signal so that cameras and lidar observe the same instant or an exactly known offset.",
    d: "A trigger source, driven from the common clock, sends pulses to cameras at the frame rate and aligns them with the lidar's sweep position, so that the camera facing forward captures the moment the lidar beam crosses the same direction. Exposure timing is recorded. Triggering reduces fusion error for fast objects, a vehicle at 30 meters per second moves a meter in 33 milliseconds. Complexity comes from sensors that cannot be triggered, differing exposure lengths, and the wiring and electrical robustness needed.",
    k: ["Trigger sensors vs timestamp free-running sensors: triggering gives exact alignment and demands support from every sensor; free-running is simple and requires interpolation.", "Capture at the midpoint vs start of exposure: midpoint timing is more physically meaningful; start is easier to implement."],
    p: ["A cable fault drops trigger pulses and the camera free-runs at a different phase.", "Exposure changes with light, shifting the effective capture time unless compensated."],
    v: "Image a fast rotating marker from two cameras and compare marker angles at the logged capture times; the difference corresponds to the stated timing error, not more.",
    dep: ["clock-distribution"]
  },
  "timestamp-alignment": {
    s: "Assigns each measurement the true time it was captured, not the time it arrived, and interpolates data to a common instant for fusion.",
    d: "Every message carries a capture timestamp from the sensor or the interface hardware, in the common time base. Processing delays, transport and queueing are tracked separately. Consumers interpolate or extrapolate streams to a chosen time, such as the camera exposure instant. Mistakes are insidious: using the arrival time instead of the capture time introduces a latency-dependent error that varies with load, so a system tested at light load fails on busy roads. Stamps must also be monotonic and checked.",
    k: ["Capture timestamps vs arrival timestamps: capture times give physically correct alignment and need hardware support; arrival times are easy and vary with load.", "Interpolate between samples vs extrapolate forward: interpolation is accurate and adds latency; extrapolation is immediate and error-prone."],
    p: ["Timestamps are reset or wrapped on a sensor reboot and fusion rejects or mismatches data.", "A software component restamps messages on arrival, destroying the capture information."],
    v: "Inject a known delay into one sensor path and check that fused output is unaffected, because capture stamps are preserved; the monitor flags a stream whose stamp is non-monotonic.",
    dep: ["clock-distribution", "pubsub-middleware"]
  },
  "compute-hardware": {
    s: "The onboard computers, with processors, accelerators for neural networks, and safety microcontrollers, designed for automotive temperature, power and reliability.",
    d: "A main computing platform combines general-purpose cores, graphics or neural-network accelerators and sensor input interfaces, within a tight power and thermal budget in a sealed box. A separate safety microcontroller, certified to a high integrity level, runs monitoring and the watchdog. Memory bandwidth often limits performance more than arithmetic. Redundant platforms may run in parallel or as a backup. The difficulties are thermal throttling in hot weather, long supply and qualification cycles for automotive parts, and choosing capacity for software that will grow over the vehicle's life.",
    k: ["One powerful computer vs several smaller ones: one is simpler and a single point of failure; several give redundancy and complicate integration.", "Leave headroom vs size to current needs: headroom allows future models and costs money and power in every vehicle."],
    p: ["The computer throttles in summer heat and latency rises exactly when roads are busiest.", "Models grow beyond the platform's memory and new features need hardware that is already on the road."],
    v: "Run the full stack at maximum load in a hot chamber for hours and record clock throttling, latency percentiles and power; latency stays inside the budget with the stated headroom.",
    dep: ["real-time-scheduling", "secure-boot-and-update"]
  },
  "inference-runtime": {
    s: "Compiles and runs neural networks on the onboard accelerators with fixed latency, reduced numeric precision and defined memory use.",
    d: "Trained models are converted to an optimized graph, quantized to low-precision numbers, fused into efficient operations and scheduled onto accelerators. The runtime guarantees a bounded execution time and manages memory so that allocation never occurs during driving. Output must stay close to the training framework's result, which is checked layer by layer. Challenges include operators the accelerator does not support, accuracy loss from quantization on rare inputs, and keeping multiple networks from interfering with each other's timing.",
    k: ["Aggressive quantization vs higher precision: lower precision is faster and uses less power; it can degrade accuracy on rare inputs that aggregate metrics do not show.", "Compile ahead of time vs just in time: ahead of time gives predictable latency and verified binaries; just in time adapts and is not acceptable for safety functions."],
    p: ["A network passes accuracy tests in float and loses recall on small objects after quantization.", "Two networks share the accelerator and one's latency doubles when the other runs."],
    v: "Run the deployed binary on reference inputs and compare outputs with the training framework's, within a stated tolerance, and record worst-case latency over many hours under full system load.",
    dep: ["compute-hardware", "real-time-scheduling"]
  },
  "pubsub-middleware": {
    s: "Moves typed messages between processes by topic with defined delivery guarantees, timestamps and discovery, so components can be developed and replaced independently.",
    d: "Each component publishes and subscribes to named streams, such as object lists or pose, described by message definitions. The middleware handles discovery, serialization, queueing and delivery policies, such as keeping only the latest message or guaranteeing delivery. It records and replays traffic and exposes timing. It decouples components and at the same time hides dependencies, so ordering and latency are emergent properties that must be measured. Large messages, like images and point clouds, need special transport paths.",
    k: ["Brokerless direct communication vs a central broker: brokerless has lower latency and no single point of failure; a broker simplifies discovery and adds a hop.", "Reliable delivery vs latest-value delivery: reliable guarantees completeness and can add delays under load; latest-value keeps freshness and drops data."],
    p: ["A slow subscriber's queue fills, and delivery of old data delays new data.", "Message definition changes break a consumer that was not rebuilt, and fields are silently misread."],
    v: "Measure end-to-end latency percentiles per topic under full load, and verify that a subscriber started late or restarted receives the right data and that a version mismatch is rejected.",
    dep: ["zero-copy-transport", "real-time-scheduling", "timestamp-alignment"]
  },
  "real-time-scheduling": {
    s: "Assigns processor time with priorities and deadlines so that critical control and monitoring tasks always run on time, whatever the load of the rest of the system.",
    d: "A real-time operating system, or a partitioned system with a hypervisor, runs tasks with fixed priorities and timing budgets and isolates them from each other, including their memory and processor cores. Perception can overrun a frame without delaying the controller. Execution times are measured and bounded, and deadline misses are detected and reported. The hard part is interference through shared resources such as caches and memory bandwidth, which break isolation in ways that scheduling alone cannot fix, and priority inversion across communication boundaries.",
    k: ["Strict partitioning vs flexible sharing: partitions guarantee isolation and waste capacity; sharing uses the hardware well and permits interference.", "Time-triggered execution vs event-triggered execution: time-triggered is predictable and verifiable; event-triggered reacts quickly and is harder to bound."],
    p: ["A perception task overruns because of cache contention, and the control task is late once an hour.", "A high-priority task blocks on a lock held by a low-priority one."],
    v: "Run worst-case load on every partition simultaneously and record the control task's period jitter and deadline misses over a long run; there are none, and a deliberately overrunning task is contained.",
    dep: ["compute-hardware"]
  },
  "zero-copy-transport": {
    s: "Passes large sensor data between processes through shared memory instead of copying, so images and point clouds move at line rate without using up memory bandwidth.",
    d: "Publishers write into shared memory buffers and send only a handle through the middleware. Subscribers map the buffer and read it in place, with reference counting to know when it can be reused. Accelerators can read buffers directly. At gigabytes per second of sensor data, copies would consume the memory bandwidth and delay everything. The cost is lifetime management: a slow reader holds a buffer, which blocks the writer, and a crashed reader leaks it. Access control must keep one component from corrupting another's data.",
    k: ["Shared memory handles vs serialized copies: handles are fast and tie components to the same machine; copies work across machines and cost bandwidth.", "Fixed-size buffer pools vs dynamic allocation: pools give predictable latency and fail when exhausted; dynamic allocation adapts and risks jitter."],
    p: ["A crashed subscriber never releases its buffers, and the pool runs dry.", "A reader modifies a buffer in place, and other readers see corrupted data."],
    v: "Stream all camera and lidar data at full rate while killing a subscriber repeatedly; memory use is steady, buffers are reclaimed, and the other subscribers see no loss or corruption.",
    dep: ["compute-hardware", "real-time-scheduling"]
  },
  "secure-boot-and-update": {
    s: "Verifies that only signed, trusted software starts, and delivers software and model updates to the vehicle with rollback if the update fails.",
    d: "A chain of trust starts in hardware and verifies each stage of boot against signatures. Updates arrive over the air in a package covering the stack, models and maps, are verified, installed in an inactive slot, and activated at a safe time, such as when parked. If checks after reboot fail, the previous version is restored. Fleets run mixed versions during a rollout, so interfaces must be compatible, and a staged rollout limits the effect of a bad release. Every update changes the safety argument, so approval gates apply.",
    k: ["A/B slots with rollback vs in-place update: slots allow safe recovery and double storage; in-place is smaller and can brick the vehicle.", "Staged rollout vs fleet-wide push: staged limits blast radius and delays fixes; fleet-wide is fast and spreads a flaw to every vehicle at once."],
    p: ["An update interrupted by a power loss leaves the vehicle without a bootable image.", "Models and maps are updated in an order that leaves them mutually incompatible."],
    v: "Interrupt an update at several points on a test vehicle, and confirm that each time it boots into the previous version and reports the failure; tamper with a package and confirm it is rejected.",
    dep: ["vehicle-cybersecurity"]
  },
  "operational-design-domain": {
    s: "The explicit definition of where and when the system is designed to work: road types, speeds, weather, lighting and geography, and what happens at its edge.",
    d: "The domain is a list of conditions, such as mapped urban roads below a speed limit in daylight and light rain. It scopes the hazard analysis, scenario library, validation and map coverage, and drives routing and the mode manager's decision to hand over or stop. A narrow domain makes safety claims achievable and limits usefulness. The system must detect the edge: knowing that visibility has fallen below the limit is itself a perception problem. Expanding the domain restarts validation for the new conditions.",
    k: ["Narrow domain with strong guarantees vs broad domain with weaker ones: narrow is provable and limits usefulness; broad serves more trips and has a long tail of unknowns.", "Static map-defined domain vs dynamic conditions-based domain: static is easy to enforce; dynamic reflects weather and traffic and requires reliable detection."],
    p: ["The domain says light rain, and nothing in the system measures rain intensity.", "The vehicle is routed to a road outside the domain because the router did not know about it."],
    v: "For each domain condition, show the runtime signal that detects it and the logged behavior when it is violated in test; cross the boundary and observe the planned handover or stop.",
    dep: []
  },
  "end-to-end-latency-budget": {
    s: "The allocation of the time from a photon hitting a sensor to a wheel responding, among every stage, so that the total supports the speeds and stopping distances required.",
    d: "At 100 kilometers per hour the vehicle travels about 28 meters per second, so every 100 milliseconds is almost three meters of blind travel. The budget assigns time to exposure, transport, perception, tracking, prediction, planning, control and actuation, with percentile targets, not averages. Each team must stay within its share, and variation matters as much as the mean. Measurement requires consistent timestamps across the whole chain. Budgets tighten when speed rises, and the worst case, not the typical case, sets the safe speed.",
    k: ["Optimize the average vs bound the tail: averages improve comfort; tail latency determines whether a collision is avoided.", "Pipeline stages in parallel vs in series: pipelines raise throughput and add latency; series keeps data fresh and idles the hardware."],
    p: ["Each stage meets its own target while the sum exceeds the total because queueing was not counted.", "Latency spikes occur only under rare load combinations and are missing from averaged dashboards."],
    v: "Inject a marker event, such as a light flash, at the sensor and measure the time until the brake command, over hours, and compare the 99.9th percentile with the stopping-distance requirement.",
    dep: ["timestamp-alignment", "real-time-scheduling", "pubsub-middleware"]
  },
  "redundancy-and-diversity": {
    s: "The decisions about which sensors, computers, power supplies and algorithms are duplicated, and which are made different on purpose, so that one fault or one shared flaw does not cause a loss of control.",
    d: "Duplicate copies protect against random hardware failure, and different designs protect against shared design flaws. A typical vehicle has redundant power, redundant steering and braking actuators, overlapping sensors of different types, and an independent monitoring channel. Each added copy costs money, weight and integration, and brings its own ability to fail, such as the voting logic. The analysis needs to find common causes: a single connector, a shared clock, the same software library. A redundancy claim is only as good as its independence.",
    k: ["Identical duplication vs diverse implementation: identical is cheap and consistent and shares design bugs; diverse removes common flaws and costs double development.", "Active-active vs hot standby: active-active detects disagreement continuously; standby saves power and risks an untested takeover."],
    p: ["Two redundant channels share a power connector, and one fault disables both.", "A standby path is never exercised and fails when called on."],
    v: "Disconnect each power rail, computer and sensor group in turn during a test, and verify the vehicle continues or stops safely as the design states; list each shared component and show the analysis of its failure.",
    dep: ["independent-safety-channel", "compute-hardware", "fault-management"]
  },
  "uncertainty-propagation": {
    s: "The practice of carrying a measure of doubt from each sensor reading through detection, tracking, prediction and planning, so that decisions reflect how much is actually known.",
    d: "Each stage outputs an estimate and an uncertainty: position covariance, class probability, predicted spread. Later stages combine them, inflating safety margins when doubt is large. In practice, interfaces tend to drop uncertainty, passing a clean box to the planner, and each stage is calibrated differently so numbers cannot be combined meaningfully. The aim is a consistent, calibrated representation end to end. Without it, planners are either reckless in the unfamiliar or timid everywhere, because they have no principled way to know which situation they are in.",
    k: ["Propagate full distributions vs scalar confidences: distributions are expressive and expensive; scalars are cheap and discard correlation.", "Calibrate each stage separately vs end to end: stage-wise is modular; end-to-end captures compounding errors and cannot localize the cause."],
    p: ["An interface drops the covariance, and the planner treats every estimate as exact.", "Stage uncertainties are each overconfident and their combination is wildly optimistic."],
    v: "Check at each interface that uncertainty fields exist and are consumed; compare predicted error bounds against measured errors over a large drive set, per stage and end to end, with coverage close to the nominal level.",
    dep: ["perception-confidence", "prediction-uncertainty", "localization-integrity"]
  },
  "determinism-and-replayability": {
    s: "The property that the same inputs produce the same outputs, so any drive can be replayed exactly and a regression can be tied to a specific change.",
    d: "Exact replay needs recorded inputs with capture timestamps, fixed random seeds, deterministic scheduling or at least deterministic message ordering, and fixed floating-point behavior across hardware. Neural network inference on accelerators and multithreaded code are common sources of nondeterminism. Without determinism, regression testing is statistical and a rare bug cannot be reproduced. Full determinism can cost performance and conflict with asynchronous design, so teams choose where it is strict, such as planning, and where only statistical agreement is demanded.",
    k: ["Deterministic execution everywhere vs only in selected modules: everywhere gives exact replay and costs speed and design freedom; selected modules cover most debugging needs.", "Replay in real time vs simulated time: simulated time is deterministic and fast; real time shows scheduling effects replay hides."],
    p: ["A parallel reduction changes the order of floating-point additions, and a replay differs by one bit that grows into a different decision.", "Recorded inputs lack the random seed, so the replay cannot reproduce the original path."],
    v: "Replay one recorded drive several times on identical software and compare every output message bit for bit; a deliberate change is shown to alter only the downstream messages expected.",
    dep: ["onboard-log-recorder", "real-time-scheduling", "timestamp-alignment"]
  },
  "vehicle-cybersecurity": {
    s: "The measures that stop attackers from reading, altering or commanding the vehicle, its software, its data and its connections to the outside world.",
    d: "Threat analysis identifies attack paths: the cellular link, update channel, diagnostic port, sensors themselves, and the supply chain. Defenses include authenticated and encrypted communication, signed software, network segmentation between the driving domain and entertainment, intrusion detection, and hardware key storage. Sensors can be spoofed, for instance by satellite spoofing or laser interference with lidar, and monitors should treat such inputs as untrusted. Security must hold across a decade of vehicle life, with updates, and a compromise must never be able to override the safety supervisor.",
    k: ["Strict network segmentation vs open integration: segmentation limits damage; it makes features that cross domains harder to build.", "Fleet-wide shared keys vs per-vehicle keys: shared keys are simple and one leak exposes every vehicle; per-vehicle keys limit damage and require provisioning at scale."],
    p: ["A diagnostic interface left enabled in production allows commands onto the control network.", "Signing keys are stored in a build system that many people can reach."],
    v: "A security test team attempts remote and physical attacks on a test vehicle against the threat model; no attack reaches the control network or alters commands, and attempts appear in the intrusion log.",
    dep: ["secure-boot-and-update", "compute-hardware"]
  },
});
