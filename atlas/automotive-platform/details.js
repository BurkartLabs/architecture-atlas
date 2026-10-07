// Details for the automotive platform, part 1: cloud backend, cockpit, vehicle control functions.
ATLAS.details("automotive-platform", {
  "ota-campaign-manager": {
    s: "The backend service that decides which vehicles receive which software, in what waves, under what conditions, and tracks each vehicle's progress to completion.",
    d: "A campaign pairs a software bundle with a target set chosen by model, hardware revision, region and current installed versions. It releases in waves, watches success and failure rates, and pauses automatically when failures cross a threshold. Vehicles poll or are notified, then report each stage. It talks to the inventory registry for compatibility, the signing service for packages, and the entitlement service. The hard part is that vehicles are offline for weeks and the target set keeps changing underneath the campaign.",
    k: ["Staged waves with automatic pause vs one-shot release: limits the damage of a bad build; slows delivery of urgent fixes.", "Target by installed-state query vs by static list: adapts to vehicles that updated elsewhere; needs a trustworthy, current inventory."],
    p: ["A campaign aimed at a hardware revision the registry has wrong bricks vehicles that cannot run the new build.", "Counting a vehicle as updated when the download finished, not when the new version booted and reported healthy."],
    v: "Launch a campaign to ten test vehicles, force one to fail its post-install check, and confirm the dashboard shows nine successes, one failure with the failed stage, and the campaign paused at its threshold.",
    dep: ["software-inventory-registry","vehicle-identity-pki","update-client"]
  },
  "fleet-data-ingestion": {
    s: "The pipeline that receives telemetry, events and logs from the whole fleet, validates them against a schema and stores them for engineering and product analysis.",
    d: "Vehicles upload batches over cellular links when cost and battery allow, in compact binary or columnar formats with a schema version. The pipeline authenticates the device, decompresses, validates, deduplicates and routes to stores for streaming, analytics and long-term archive. Collection rules are sent down to vehicles so engineers can ask for data on a specific event. Difficulty is volume and cost per vehicle, schema evolution across software versions, and privacy: much of the data is personal.",
    k: ["Event-triggered collection vs continuous streaming: far lower data cost; engineers see only what a rule anticipated.", "Edge filtering in the vehicle vs raw upload: saves bandwidth; the discarded data cannot be revisited."],
    p: ["Collecting location with identifiers and no retention limit creates a regulatory liability.", "A schema change in one software version silently drops fields from part of the fleet."],
    v: "Trigger a hard-braking event on a test vehicle and confirm a record with the right schema version, timestamp, vehicle pseudonym and signal window appears in the store within the agreed latency.",
    dep: ["vehicle-identity-pki","connected-services-gateway","data-logging-recorder"]
  },
  "remote-diagnostics-backend": {
    s: "Cloud-side services that read fault codes and vehicle state from cars in the field, correlate them across the fleet and open guided repair or recall processes.",
    d: "The backend sends a diagnostic request through the connected gateway, receives fault memory and snapshots, and matches them against known-issue rules and repair knowledge. It aggregates codes across vehicles to spot a failing part or a bad software version early. Service workshops use the same data. It depends on the vehicle's diagnostic stack being reachable remotely through a gateway that enforces policy. Hard parts are authorizing who may ask what, and not waking a parked vehicle's battery into the ground.",
    k: ["Rules-based triage vs statistical anomaly detection: rules are explainable and auditable; they only catch problems someone already described.", "Remote execution of diagnostic routines vs read-only access: faster fixes; a larger safety and security exposure."],
    p: ["Polling vehicles for fault codes drains the low-voltage battery overnight.", "Fleet-wide fault counts without software version normalization blame hardware for a software regression."],
    v: "Inject a known fault into a test vehicle, request diagnostics remotely, and confirm the fault code, its freeze frame and the matching repair guidance appear for the operator, with an audit entry for the request.",
    dep: ["connected-services-gateway","uds-diagnostic-services","fleet-data-ingestion"]
  },
  "vehicle-digital-twin": {
    s: "A cloud model of each individual vehicle's configuration, installed software, usage and condition, kept in step with the real car and used for planning and prediction.",
    d: "The twin holds the as-built bill of materials, the as-maintained software versions, option codes, entitlements and summarized health such as battery aging. It is updated from vehicle reports and from backend actions, and answered to by other services as the source of truth for what this car is. Models of component wear run against it. The difficulty is staleness: the twin lags the car, and workshop repairs, second-hand parts and failed updates make it diverge.",
    k: ["Report-driven state vs command-driven state: reports reflect reality; commands let the backend plan, but a lost command leaves a wrong twin.", "Per-vehicle full model vs per-model aggregate: precise decisions per car; much higher storage and update cost."],
    p: ["Planning an update from the twin's version list when the car is already ahead or behind causes a failed install.", "A part swapped in a workshop is never reported, so the twin keeps predicting wear for the old part."],
    v: "Change a software version on a test vehicle, then confirm the twin shows the new version within the agreed lag, and that a compatibility query for the next campaign now returns the new result.",
    dep: ["software-inventory-registry","fleet-data-ingestion"]
  },
  "vehicle-identity-pki": {
    s: "The certificate authority hierarchy and registry that gives every vehicle and controller a verifiable identity from the factory through years of service.",
    d: "A root of trust issues intermediate authorities per manufacturing site and purpose. Each controller gets a key pair, ideally generated inside its security module, and a certificate injected during production. Services authenticate vehicles with those certificates and vehicles check signatures on commands and packages. Certificates are rotated or revoked over the air when a key leaks or expires. The hard parts are provisioning at line speed without exposing keys, and expiry: a certificate lasting five years in a vehicle that lives fifteen.",
    k: ["Keys generated on the device vs injected by the factory: private keys never leave the chip; some low-end parts cannot generate them.", "Short-lived certificates with renewal vs long-lived ones: limits damage from theft; vehicles offline for months can lock themselves out."],
    p: ["Letting a certificate expire in vehicles that rarely connect strands them without secure updates.", "Treating the production line's injection station as trusted without auditing it exposes every key it touches."],
    v: "Present a revoked certificate from a test vehicle to the gateway and confirm the connection is refused and logged, then renew a valid one over the air and confirm the vehicle reconnects without a workshop visit.",
    dep: ["hardware-security-module","in-vehicle-key-management"]
  },
  "feature-entitlements": {
    s: "The service that records which paid or optional features each vehicle may use and pushes that decision down so the car enables or disables them.",
    d: "Features are shipped in the software but locked by default. A purchase, subscription, trial or regional rule produces an entitlement record bound to a vehicle identity, signed so the car can verify it offline. The vehicle's activation runtime reads it and switches the feature. The service integrates billing and customer accounts and must handle transfers when a car is sold. Difficulty is consistency: the vehicle must keep working correctly during an outage and after a subscription lapses, without lock-outs of safety functions.",
    k: ["Signed entitlements cached in the vehicle vs online checks per use: features work offline; revocation is delayed until the next sync.", "One unlockable software build vs per-trim builds: simpler validation and logistics; a hacked unlock affects every car."],
    p: ["Gating anything safety-relevant on a cloud subscription state means a lapsed payment changes how the vehicle drives.", "Not clearing entitlements when ownership changes leaves previous owners' paid features, or locks the new owner out."],
    v: "Grant a trial entitlement to a test vehicle, confirm the feature enables with the vehicle offline, then let it expire and confirm the feature disables on the signed expiry time without any network call.",
    dep: ["vehicle-identity-pki","connected-services-gateway","feature-activation-runtime"]
  },
  "connected-services-gateway": {
    s: "The backend edge that terminates the vehicle's long-lived secure connections, authenticates each car and routes messages to the right internal services.",
    d: "Vehicles keep an authenticated session over a cellular link using a lightweight publish-subscribe or request protocol. The gateway verifies the vehicle certificate, applies rate limits and per-vehicle authorization, and maps topics to services such as ingestion, diagnostics and entitlements. It buffers commands for sleeping vehicles and delivers when they wake. At millions of vehicles, reconnect storms after an outage and the cost of keeping idle connections open dominate the design.",
    k: ["Persistent connection vs wake-and-poll: low command latency and push semantics; costs power and cellular data in the vehicle.", "Per-vehicle topics vs shared fleet topics: strong isolation; far more broker state to manage."],
    p: ["After a backend outage every vehicle reconnects at once and overloads authentication.", "Queuing commands for an offline vehicle without an expiry executes an hours-old unlock request when it wakes."],
    v: "Disconnect a test vehicle, send a command with a five-minute expiry, reconnect after ten minutes, and confirm the command is discarded and reported expired rather than executed.",
    dep: ["vehicle-identity-pki"]
  },
  "software-inventory-registry": {
    s: "The authoritative database of every software and hardware part number, version, dependency and compatibility rule, and which of them is installed in which vehicle.",
    d: "Each controller reports its part number, hardware revision and software versions. The registry stores them alongside release metadata, signatures, compatibility matrices saying which versions may coexist, and the software bill of materials listing every component with its license and known vulnerabilities. Campaigns, diagnostics and regulatory reports query it. It is hard because a vehicle is a set of tens of independently versioned parts from different suppliers, and legal validity depends on the recorded combination, not on any single version.",
    k: ["Explicit compatibility matrix vs inferred rules from tests: update decisions are auditable; someone must maintain the matrix for every release.", "Registry as the single source vs reading state from each car: consistent planning; stale when a car changes outside the process."],
    p: ["An undeclared dependency between two supplier packages lets a campaign install a combination nobody tested.", "SBOM data collected once at release and never re-scanned misses vulnerabilities disclosed later."],
    v: "Ask the registry whether version B of one controller is allowed beside version A of another, and confirm the answer matches the signed compatibility matrix and lists the vehicles currently affected.",
    dep: []
  },
  "head-unit-shell": {
    s: "The main entertainment and information application environment: launcher, settings, notifications and the glue that hosts media, navigation and vehicle apps on the central display.",
    d: "The shell runs on a general-purpose OS partition. It starts applications, manages focus between them, shows system notifications and exposes vehicle settings backed by the data broker. It enforces driver-distraction rules such as hiding video while moving and limiting text input. It integrates user profiles and cloud accounts. The challenge is scale of change with a decade of life: it must look current, accept new features by update, and still satisfy rules fixed at type approval.",
    k: ["Native shell vs web-based applications: speed and control vs faster delivery and third-party content.", "Single process shell vs many isolated apps: one crash must not blank the screen; costs memory and start-up time."],
    p: ["A slow boot leaves the screen black while the reversing camera is legally required to show an image within two seconds.", "Settings changes applied by the shell but not confirmed by the controller leave the display wrong about the vehicle state."],
    v: "Cold-start the head unit with the ignition on and confirm the first usable screen appears within the target time, then drive above walking speed and confirm blocked functions are disabled.",
    dep: ["display-compositor","in-car-app-framework"]
  },
  "instrument-cluster": {
    s: "The driver's display showing speed, warnings and telltales, drawn by software that must stay correct even when the rest of the cockpit has crashed.",
    d: "Legally required indicators such as brake and airbag warnings and speed must appear reliably. The cluster draws them from signals received on a protected path, with checks that detect a frozen or corrupt image. In consolidated designs it shares a computer with infotainment through the hypervisor, with its own partition and display pipeline. Hard parts are verifying that what is on screen is what the signal says and keeping the render path safe while the animations stay modern.",
    k: ["Separate safe display pipeline vs shared GPU with isolation: simpler assurance; a second display chain costs money, power and weight.", "Image self-check by CRC or reference compare vs trust in the renderer: catches frozen frames; adds latency and complexity."],
    p: ["A frozen frame showing a stale speed is worse than a blank screen and passes tests that only check for crashes.", "Warning priority rules differ between regions and are hard-coded in several places that drift apart."],
    v: "Freeze the renderer in a test build while changing the speed signal, and confirm the safety monitor detects the stale image and shows the fallback warning within its specified time.",
    dep: ["display-compositor","end-to-end-protection","mixed-criticality-partitioning"]
  },
  "display-compositor": {
    s: "Combines the output of many applications and partitions into the images shown on each display, deciding what appears on top and which surface gets priority.",
    d: "Applications render into buffers that the compositor blends, scales and sends to display controllers, often several displays with different resolutions and rates. Safety-relevant surfaces such as a camera feed or warnings must win over decoration. Buffers can cross partition boundaries through shared memory managed by the hypervisor. The challenge is deadline-bound frame delivery on shared GPUs, synchronization between displays, and ensuring a faulty application cannot occlude a mandatory warning.",
    k: ["Hardware overlay planes for critical surfaces vs software blending: critical content bypasses the GPU; the number of planes is fixed in silicon.", "One compositor for all displays vs one per display: shared resources and transitions between screens; a single point of failure."],
    p: ["A misbehaving app that holds its buffer too long stalls the whole frame for every display.", "Frame pacing differences between cluster and center display make animated content visibly out of step."],
    v: "Run a stress application that renders slowly, trigger a warning, and confirm the warning surface still appears on top within one frame period of the signal.",
    dep: ["gpu-virtualization","virtual-device-sharing"]
  },
  "audio-routing": {
    s: "Mixes and routes every sound source, such as media, calls, navigation prompts and safety chimes, to the right speakers with priorities, ducking and latency limits.",
    d: "Sources attach to streams with a usage class. The router applies priority rules, so a seat-belt chime interrupts music and navigation prompts lower the volume rather than stopping it. A digital signal processor handles equalization, per-seat zones, noise cancellation and external sound for pedestrians. Audio can travel over a dedicated audio bus or Ethernet streams. Hard parts are low-latency paths for hands-free calls, synchronization across amplifiers and keeping safety sounds audible regardless of application state.",
    k: ["Central software mixer vs a separate DSP: flexible processing; real-time deadlines compete with other work on the host.", "Network audio streams vs a dedicated audio bus: fewer wires; needs precise clocks and bandwidth reservation."],
    p: ["A media app that crashes while holding the audio focus leaves the warning chime silent.", "Sample rate conversion in the wrong place adds delay that breaks echo cancellation on calls."],
    v: "Play music, then trigger a safety chime and a navigation prompt, and confirm the chime plays at full level over the music, the prompt ducks it, and the music resumes afterwards.",
    dep: ["inter-vm-communication","time-synchronization"]
  },
  "media-framework": {
    s: "Plays and records audio and video from radio, storage, streaming and cameras, with codecs, buffering and hardware decode.",
    d: "A pipeline of sources, demultiplexers, decoders and renderers is assembled per request. It handles broadcast radio tuners and their metadata, streaming services, files on connected storage, and camera streams for rear view and surround views. Hardware decoders and encoders reduce load. Content protection keys are held in secure hardware. Difficulty comes from the number of formats, the long tail of broken files and devices, and the need to resume cleanly after the system sleeps and wakes.",
    k: ["Hardware codecs vs software codecs: low power and heat; fixed format support that cannot gain new formats by update.", "Strict pipeline validation vs tolerant parsing: protects against malformed files exploiting parsers; rejects files other players accept."],
    p: ["A parser handling untrusted files from a USB stick or phone is a common route to code execution.", "Resuming playback after wake with stale buffers produces seconds of the wrong audio."],
    v: "Play a corrupt file and a malformed stream from external storage and confirm the player rejects both without crashing or leaving the audio output stuck.",
    dep: ["audio-routing","virtual-device-sharing"]
  },
  "navigation-engine": {
    s: "Locates the vehicle on a map, plans routes using live traffic and charging stops, and guides the driver with turn prompts.",
    d: "It fuses satellite positioning with wheel speed and inertial data to keep a position through tunnels, matches it to a map database, and searches for routes under cost models that include traffic, tolls, elevation and for electric vehicles the energy and charger availability. Map data is updated in regions and shared with automated driving functions that need lane-level detail. Hard parts are map freshness, route planning that predicts battery state, and showing correct guidance when positioning briefly disagrees with the map.",
    k: ["Onboard maps vs streamed tiles: works without coverage; large storage and slower updates.", "Route planning on the vehicle vs in the cloud: works offline and responds quickly; cloud has fresher traffic and heavier computation."],
    p: ["Energy prediction that ignores temperature or elevation leads an electric vehicle to a charger it cannot reach.", "Stale map data guides drivers onto a road that has changed direction."],
    v: "Drive a recorded route through a tunnel with the satellite signal removed and confirm the position stays within the specified error and the next turn prompt fires at the right distance.",
    dep: ["vehicle-data-broker","head-unit-shell"]
  },
  "voice-interaction": {
    s: "Listens for a wake word, recognizes speech and maps it to vehicle and infotainment commands, using local models and cloud services.",
    d: "Microphones in each seat feed noise and echo cancellation, then wake-word detection and speech recognition, partly on the vehicle for common commands and partly in the cloud for open questions. An intent layer maps phrases to actions such as setting temperature, navigating or reading messages, and a dialog manager asks follow-ups. It must work with road noise, music and multiple speakers, and must route commands to features only when they are allowed while driving.",
    k: ["Local recognition for core commands vs cloud for everything: works without coverage and responds faster; weaker on open phrasing and slower to improve.", "Always-listening wake word on the vehicle vs push-to-talk: natural interaction; microphones are active, with privacy implications."],
    p: ["Echo cancellation tuned on a test bench fails in a cabin with the real speakers and glass.", "A command that changes a safety-relevant setting is accepted from a passenger seat microphone without checking who spoke."],
    v: "At highway speed with music playing, say a temperature command from the driver seat and confirm it is recognized, executed on the correct zone and confirmed, within the target response time.",
    dep: ["audio-routing","vehicle-data-broker","connected-services-gateway"]
  },
  "phone-projection": {
    s: "Shows a smartphone's navigation, calls and media on the vehicle display using a standardized protocol over cable or wireless link.",
    d: "The phone renders its own interface and streams video and audio to the head unit, which sends touch, buttons and vehicle context back. The vehicle provides the display, input and a limited set of data, and applies its own distraction restrictions. Wireless variants negotiate a radio link over short-range and wireless local networks. It is hard because the phone and vehicle evolve on different schedules, so compatibility is tested against a moving matrix of phone models and versions, and latency has to feel immediate.",
    k: ["Projection of the phone's own interface vs a native app set: users get familiar apps and fresh content; the manufacturer loses control of the experience and data.", "Wired vs wireless connection: convenience; extra latency, power use and more ways to fail to connect."],
    p: ["A phone update changes protocol behavior and breaks projection for a model range until a head unit update ships.", "Projected video that ignores the vehicle's lock-out rules shows content that should be hidden while driving."],
    v: "Connect two phone generations by cable and wirelessly, start navigation and a call, and confirm display, touch and audio work with end-to-end touch latency within the target.",
    dep: ["display-compositor","audio-routing","head-unit-shell"]
  },
  "in-car-app-framework": {
    s: "The runtime and interfaces for installing third-party and manufacturer applications on the head unit with controlled access to vehicle data and screens.",
    d: "Applications are packaged with a manifest declaring permissions and run sandboxed on the general-purpose OS. They reach vehicle signals only through the data broker's API with permission checks, and draw into surfaces the compositor allows. A store service handles install, update and revocation. It must apply driver-distraction rules automatically and enforce resource quotas. The difficulty is giving developers useful access to data while keeping a faulty or malicious app from affecting driving functions or privacy.",
    k: ["Fixed vehicle API with permissions vs open signal access: apps stay portable across models and are auditable; capabilities arrive slowly.", "Native packages vs web apps: better performance and access; larger attack surface and longer review."],
    p: ["Permissions granted once at install and never reviewed let an app read location years later.", "Apps that stay running in the background drain the battery of a parked vehicle."],
    v: "Install an app that requests a signal it was not granted and confirm the API refuses it and logs the attempt, while an app with the permission reads it at the documented rate.",
    dep: ["vehicle-data-broker","app-sandbox","access-control-policy"]
  },
  "powertrain-control": {
    s: "Control of the engine, motor, transmission or drive inverter: torque requests are turned into precise actuation under hard real-time deadlines.",
    d: "Driver pedal input and higher-level requests become a torque target, split between sources such as engine and motor. Control loops run in sub-millisecond to ten-millisecond periods, synchronized with crankshaft or rotor position, and use calibrated maps for efficiency and emissions. Limits protect hardware and passengers. It exchanges torque requests with stability control and the transmission. The difficulty is emissions compliance across conditions, the volume of calibration data and strict timing on angle-based tasks.",
    k: ["Model-based control with calibrated maps vs fixed-gain control: efficiency across operating points; more calibration effort and more states to test.", "Torque-based interfaces vs speed-based: other functions can be added without knowing the powertrain; torque estimates must be accurate."],
    p: ["A late task during an injection or inverter switching window produces a misfire or a current spike.", "Calibration data from one variant loaded onto another gives plausible-looking but wrong torque."],
    v: "On a dynamometer, step the pedal across the operating range and confirm delivered torque tracks the request within tolerance, with no fault codes and emissions within limits.",
    dep: ["static-real-time-os","calibration-data-sets","end-to-end-protection"]
  },
  "chassis-and-brake-control": {
    s: "Stability control, anti-lock braking, steering assist and suspension functions that act on the wheels and are among the most safety-critical software in the car.",
    d: "Wheel speed, yaw rate and steering angle sensors feed control loops that modulate brake pressure per wheel, steering torque or damper force within a few milliseconds. Redundant sensors and compute paths detect faults, and the system degrades to a defined safe behavior such as basic braking without assist. Brake-by-wire and steer-by-wire remove the mechanical backup and demand dual power and communication. The difficulty is proving that no single failure produces unintended braking or loss of control.",
    k: ["Mechanical fallback vs fully redundant electronics: simple, proven degraded behavior; limits packaging and automated driving use.", "Centralized chassis computer vs per-wheel controllers: shared sensor fusion; a single failure affects all wheels unless duplicated."],
    p: ["A sensor plausibility check that is too tight raises false faults on rough roads and disables stability control.", "Degradation to a safe state without telling other controllers leaves the automated driving function assuming full braking authority."],
    v: "Disconnect one wheel speed sensor in a test vehicle and confirm the system reports the fault, reverts to the specified degraded mode and keeps braking within the required deceleration.",
    dep: ["safe-state-and-degradation","can-bus","safety-microcontroller"]
  },
  "body-control": {
    s: "Locks, lights, windows, seats, wipers and similar comfort functions, with many small actuators and a large combinatorial variety by market and trim.",
    d: "Body controllers read switches and sensors, run simple state machines and drive loads through smart power drivers with current limits and diagnostics. Functions include keyless entry, exterior and interior lighting, and climate comfort. They own most low-speed bus traffic and the vehicle's wake and sleep behavior. Individually simple, they are hard collectively: hundreds of variants, interactions such as locking while a door is open, and standby current that must stay a few milliamps.",
    k: ["Functions distributed across many small controllers vs consolidated in zonal controllers: reuse of proven parts; more wiring and bus load.", "Software variants by option code vs separate builds: one binary to validate; every option combination must be tested or ruled out."],
    p: ["Two functions both driving the same lamp or lock without an arbitration rule leave it in the state of whichever ran last.", "A feature that keeps a bus awake raises sleep current and drains the battery in a few days."],
    v: "Lock the vehicle, wait for sleep, measure the standby current against its limit, then wake it with a key fob and confirm doors, lights and indicators respond in the specified time.",
    dep: ["network-management-and-sleep","smart-sensors-and-actuators","variant-coding"]
  },
  "thermal-management": {
    s: "Controls coolant loops, refrigerant circuits, heat pumps, fans and cabin climate to keep the battery, motors, electronics and passengers within temperature windows efficiently.",
    d: "Valves, pumps and compressors route heat between components. A supervisory controller selects a mode, such as warming the battery from motor waste heat, based on temperature models, route and charging plans, and passes setpoints to local loop controllers. Cabin comfort is balanced against range. The difficulty is slow, strongly coupled dynamics with many modes, plus safety limits such as battery overtemperature that must override comfort and efficiency, and calibration across extreme climates.",
    k: ["Predictive control using route and weather vs reactive thresholds: better range and fast charging readiness; depends on data that may be missing.", "Central thermal manager vs local controllers per loop: global optimization; larger blast radius when it fails."],
    p: ["A mode transition that opens one valve before closing another dumps coolant pressure and trips a fault.", "Cabin preconditioning that ignores charger limits drains the battery before departure."],
    v: "In a climatic chamber at minus twenty and forty degrees, run a drive and charge cycle and confirm battery and cabin temperatures stay within limits with no mode oscillation.",
    dep: ["battery-management","navigation-engine","vehicle-abstraction-layer"]
  },
  "battery-management": {
    s: "Monitors every cell of a traction battery, estimates charge and health, balances cells and limits power so the pack stays inside safe voltage, current and temperature bounds.",
    d: "Cell monitor chips measure voltage and temperature across hundreds of cells and report to a master controller. Algorithms estimate state of charge and health from models and measurements, set power limits for drive and charge, and balance cells. Contactors disconnect the pack on faults such as overcurrent or isolation loss. It is safety-critical because a fault can cause thermal runaway. Hard parts are accurate estimation as cells age, fast detection of internal faults and long-term data.",
    k: ["Model-based estimation vs measurement counting: better accuracy across conditions; needs cell characterization and cloud-updated parameters.", "Active balancing vs passive balancing: recovers capacity faster; adds hardware cost and complexity."],
    p: ["State-of-charge drift after months of use makes range predictions wrong and shows empty when energy remains.", "A missed cell temperature sensor fault leaves one hot cell unmonitored during fast charging."],
    v: "Run a standard charge and discharge profile on a test pack, compare estimated charge to measured energy, and confirm error stays within the limit and the pack disconnects when a simulated cell fault is injected."
    ,dep: ["safe-state-and-degradation","can-bus","vehicle-digital-twin"]
  },
  "charging-controller": {
    s: "Negotiates power with a charger, manages the charging session and authenticates the vehicle and user, for both conductive and bidirectional charging.",
    d: "On plugging in, the controller exchanges capability data with the charging station over a power-line or Ethernet link, agrees on current and voltage, and closes contactors after safety checks. It supports plug-and-charge using certificates so billing needs no card. Scheduling follows tariffs and grid limits, and bidirectional modes feed energy back. It talks to the battery manager, thermal management and cloud. Interoperability is the main difficulty: thousands of chargers implement the standard differently.",
    k: ["Plug-and-charge with certificates vs user authentication at the station: seamless billing; requires a certificate trust chain across operators.", "Controller tolerant of out-of-spec chargers vs strict conformance: more sessions succeed; risk of unsafe edge cases."],
    p: ["A charger that restarts negotiation mid-session leaves the vehicle waiting forever for a state that never comes.", "Expired contract certificates fail silently, and the driver finds out at the station."],
    v: "Test the vehicle against a set of reference chargers and a conformance emulator, and confirm it completes a session with each, including a deliberately interrupted one that resumes or ends safely.",
    dep: ["battery-management","thermal-management","vehicle-identity-pki"]
  },
  "driver-assistance-host": {
    s: "The computer and software framework that runs assistance functions such as adaptive cruise and lane keeping, taking sensor data and issuing limited control requests.",
    d: "It ingests camera, radar and other sensor streams, runs perception and planning, and sends bounded requests for acceleration and steering to the chassis and powertrain controllers, which retain authority and can refuse. A driver-monitoring function checks that the driver can take over. Its software runs on high-performance computers with accelerators and uses the adaptive platform. The difficulty is validating behavior across a vast set of scenes and proving that failures hand control back safely. See the autonomous driving plate for the full stack.",
    k: ["Assistance computer proposes, chassis controller disposes: the safe actuator keeps control; capabilities depend on the actuator's willingness and latency.", "Dedicated computer vs shared central compute: isolated safety case; extra cost and weight versus contention risk."],
    p: ["A perception update that shifts behavior slightly invalidates the validation done on the previous version.", "A handover request that arrives too late for a distracted driver is a design failure, not a driver error."],
    v: "Run a recorded scenario set through the host in simulation and on a test track, and confirm interventions, handover timing and minimum distances meet the specified thresholds with logged evidence.",
    dep: ["central-compute","service-oriented-communication","chassis-and-brake-control","safe-state-and-degradation"]
  },
});
