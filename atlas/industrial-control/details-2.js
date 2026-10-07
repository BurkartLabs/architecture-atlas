// Details part 2: supervisory servers, operator interface, alarm management.
ATLAS.details("industrial-control", {
  "scada-server": {
    s: "The central supervisory service that gathers values from controllers and remote sites, keeps the live picture, applies supervisory logic and serves operators, alarms and the historian.",
    d: "It hosts the drivers that talk to devices, the real-time tag database, the alarm engine and the interfaces for clients and the historian. It runs continuously and is usually deployed as a redundant pair. Supervisory logic such as sequencing across sites or setpoint scheduling runs here, above the controllers, which keep control running if the server is lost. It is hard because it must stay responsive with thousands of tags and flaky links, and because it is a single point where many sites meet.",
    k: ["Control logic in controllers versus in the server: controller logic keeps the process safe when the server fails, while server logic is easier to change but depends on its availability.", "One central server versus regional servers: central gives one view and fewer systems, but concentrates load and failure, while regional keeps sites working during a wide-area outage."],
    p: ["A process loop is closed through the server and drifts out of control when the server stalls for a minute.", "A server update restarts the service during a plant upset, and operators lose their view."],
    v: "Stop the server on a test system and confirm controllers continue their loops unchanged, then restart it and confirm every tag returns with current quality within the target time.",
    dep: ["driver-layer","real-time-tag-database","alarm-engine","server-failover"]
  },
  "driver-layer": {
    s: "The protocol clients inside the supervisory server that speak each device's language, translate addresses and data types into tags, and manage connections and timeouts.",
    d: "Each driver implements one protocol: it opens connections, builds requests, parses responses, converts raw registers into typed values with scaling, and marks quality when a device stops answering. Drivers group requests so that many tags are read in one exchange and schedule them to respect device limits. It is hard because devices differ in byte order, address maps and tolerance of load, and because a driver that blocks on a dead device can starve reads of healthy ones.",
    k: ["One driver per protocol versus a common open interface: per-protocol drivers can be tuned, but a common interface lets the server add devices without new code.", "Block reads versus per-tag reads: blocks are efficient, but a single bad address can fail the whole block and hide the good values."],
    p: ["A misconfigured byte order produces values that look plausible but are wrong.", "A driver waits on a device timeout and delays every other device in the same polling thread."],
    v: "Unplug one device from a test network and confirm its tags go to bad quality within the timeout while other devices keep updating at their normal rate. Reconnect and confirm recovery.",
    dep: ["register-polling-protocols","unified-architecture-server","real-time-tag-database"]
  },
  "real-time-tag-database": {
    s: "The in-memory table of current values, with quality and timestamp for every tag, that clients, alarms, scripts and the historian all read from.",
    d: "Drivers write values into it; clients subscribe to changes rather than reading continuously. Each entry holds value, quality, source timestamp, limits and links to alarm settings. Derived tags compute from others. Change notifications fan out to subscribers with throttling. It is hard because it must handle bursts, keep source timestamps rather than arrival times, and propagate bad quality correctly, so that a calculated value from a stale input does not look fresh.",
    k: ["Subscription with push on change versus polling by clients: push cuts latency and load, but needs flow control for slow clients.", "Source timestamp versus server timestamp: source timestamps show when the plant changed, but depend on device clocks being right."],
    p: ["A calculated tag keeps its last value with good quality after its input source has failed.", "A slow display client cannot keep up and its queue grows until the server runs out of memory."],
    v: "Force one input to bad quality and confirm every derived tag and display that depends on it shows bad or uncertain quality, not the last good number.",
    dep: ["driver-layer","tag-namespace"]
  },
  "polling-and-report-by-exception": {
    s: "The two ways values reach the server: regular polling of every point, or devices sending a change only when it exceeds a threshold, usually with periodic integrity polls.",
    d: "Polling is simple and predictable but wastes bandwidth on unchanged values and sets the lowest response time to the poll interval. Report by exception has outstations buffer time-stamped changes and send them unsolicited, which suits slow or paid links, and the master occasionally polls everything to correct any lost change. It is hard because exception reporting depends on thresholds and sequence handling: a missed event and a stale value cannot be told apart without the integrity poll.",
    k: ["Fast polling versus report by exception: polling is easy to reason about but scales poorly over slow links, while exceptions are efficient but need event buffers and loss recovery.", "Short integrity poll interval versus long: short intervals catch lost changes sooner, but spend the bandwidth that exception reporting was meant to save."],
    p: ["Deadbands that are too wide mean a slowly drifting value never triggers a report and the display looks frozen.", "An outstation's event buffer overflows during an outage and discards the oldest events without telling the master."],
    v: "Cut the link to a remote site, change a value there several times, restore the link, and confirm the master receives the buffered events in order with their original times and an overflow flag if any were lost.",
    dep: ["driver-layer","utility-telecontrol-protocols","rtu-and-outstations"]
  },
  "command-write-path": {
    s: "The route an operator or program command takes from the screen to a controller output, with authorization, validation, confirmation and feedback along the way.",
    d: "A command from the HMI is checked against the user's rights and the tag's limits, passed to the server, written by the driver and then confirmed by reading back the value or a feedback signal. Some commands use select-before-operate, where the target is armed first and then executed within a window, so one corrupted message cannot move equipment. Every command is logged. It is hard because a write that was sent is not a write that took effect, and uncertain outcomes on slow links must not be blindly retried.",
    k: ["Select-before-operate versus direct operate: two steps guard against stray or corrupted commands, but double the round trips and slow time-critical actions.", "Automatic retry versus operator re-issue after a timeout: retry hides transient loss, but can execute a command twice, such as a second pump start or valve step."],
    p: ["A command times out, the operator presses again, and both arrive, moving a valve twice as far as intended.", "The system shows the commanded value as the actual value when no feedback was read."],
    v: "Send a setpoint change to a test controller and confirm the audit trail shows the user, old and new value, and the display shows the confirmed value read back from the controller, not the typed one.",
    dep: ["driver-layer","operator-input-validation","audit-trail"]
  },
  "rtu-and-outstations": {
    s: "Small remote controllers at unattended sites, such as pump stations and substations, that read local instruments, run basic logic and report to the master over a wide-area link.",
    d: "An outstation has I/O, a modest processor, local logic for safe autonomous operation, a clock and a communications interface for radio, cellular or leased lines. It time-stamps events, buffers them when the link is down and executes commands from the master. Power may be solar and batteries. It is hard because it must run for years without visits, in weather, with unreliable power and links, and still behave safely when it cannot reach anyone.",
    k: ["Local autonomous control versus master-driven control: autonomy keeps the site safe during outages, but needs logic that must be maintained at many remote locations.", "Battery and sleep modes versus always on: sleeping extends autonomy on solar sites, but delays commands and complicates polling."],
    p: ["A site loses its link and, with no local fallback logic, leaves a pump running until a tank overflows.", "A drifted clock stamps events hours off and breaks the sequence of events across sites."],
    v: "Disconnect a test outstation and confirm it continues to its documented safe local behavior, buffers events with correct times, and resynchronizes with the master when the link returns.",
    dep: ["controller-cpu","digital-io-modules","wide-area-telemetry"]
  },
  "wide-area-telemetry": {
    s: "The communication links between the control center and remote sites: radio, cellular, satellite, microwave or leased lines, chosen for coverage, cost and reliability.",
    d: "Remote sites are reached over links with high latency, low bandwidth, loss and outages, so protocols use small messages and acknowledgments, with retransmission and timeouts tuned to the medium. Some networks are shared and polled in rotation. Dual paths use different technologies for resilience. Encryption and authentication are often added by a gateway. It is hard because the link characteristics drive protocol design, polling schedules and what the operator should be shown when data is old.",
    k: ["Private radio versus public cellular: private radio gives control of coverage and latency, but costs towers and licenses, while cellular is cheap and widespread but outside the operator's control.", "Single link versus dual diverse links: dual links survive one failure, but double the cost and need switchover logic that is itself tested."],
    p: ["A shared radio channel saturates when many sites report at once after a storm and the master loses most of them.", "A provider changes its network and the remote site's cellular modems quietly stop connecting."],
    v: "Pull the primary link at a test site and confirm the master switches to the backup within the target time, data continues, and an alarm records the link change.",
    dep: ["utility-telecontrol-protocols","protocol-gateways"]
  },
  "hmi-runtime": {
    s: "The program on operator stations that shows live process graphics, takes operator commands and shows alarms, drawing its values from the supervisory server or directly from controllers.",
    d: "The runtime loads display definitions, subscribes to the tags each display uses, updates graphics when values change and sends commands on operator input. Displays are navigated by hierarchy, tabs or an overview. It also hosts trends, alarm lists and logins. Panels may run on a machine next to the equipment. It is hard because it must update smoothly with thousands of animated objects, recover its view after a restart, and never show a stale value as current.",
    k: ["Server-based HMI clients versus standalone panels with direct controller access: server clients share one view and history, but panels keep working when the server is lost.", "Subscribe to visible tags only versus all tags: visible-only cuts load, but delays a full view when the operator changes screen."],
    p: ["A display keeps showing the last value when communication has failed, without any indication that the data is old.", "A display with hundreds of objects takes ten seconds to open during an upset, when the operator needs it quickly."],
    v: "Open the busiest display on an operator station while a test upset is running and confirm it renders within the target time and all values update. Cut the data source and confirm stale marking appears.",
    dep: ["real-time-tag-database","graphic-displays","user-roles-and-access"]
  },
  "graphic-displays": {
    s: "The designed screens that show the process: overviews, unit views, detail views and trends, laid out so abnormal conditions stand out and normal ones stay quiet.",
    d: "High-performance design shows values with context, such as ranges and targets, uses gray for normal and color only for abnormal, and avoids decoration. A hierarchy lets operators move from plant overview to unit to equipment to detail. Displays embed trends and indicators rather than just numbers. Style guides fix symbols, colors and layout. It is hard because the screens are designed by engineers who know the process but not always human perception, and a screen that looks impressive in a demonstration may hide the one failing value in a sea of colored numbers.",
    k: ["Realistic process pictures versus minimal gray displays: pictures feel familiar, but gray with highlighted deviations lets an operator spot problems faster and tires them less.", "Many detailed screens versus a few overviews with drill-down: detail gives completeness, but forces navigation during an upset, while overviews keep context in view."],
    p: ["Every alarm state uses a bright color, so during an upset the screen is full of color and nothing stands out.", "A numeric readout without range or trend hides that a value has been creeping toward its limit for an hour."],
    v: "Show a test operator an overview with one injected abnormal condition and time how long it takes to identify the unit and the problem. A well-designed display allows seconds, not minutes.",
    dep: ["hmi-runtime","faceplates-and-templates","alarm-engine"]
  },
  "faceplates-and-templates": {
    s: "Standard reusable screen elements and popup panels for each equipment type, so every pump, valve or loop looks and behaves the same everywhere.",
    d: "A faceplate for a motor shows state, mode, setpoints, alarms and commands, bound to the tags of one instance. A library holds symbols and templates; changing the template updates every instance. The same structure is mirrored in controller function blocks, so a screen object and its logic share a name and interface. It is hard because the template must cover all uses without becoming a cluttered superset, and because screen and controller versions must evolve together.",
    k: ["Faceplates mirrored with controller blocks versus separate custom screens: mirroring gives consistency and fast engineering, but couples HMI releases to controller block versions.", "One generous template versus several variants: one template is easy to maintain, but fills with options that most equipment never uses."],
    p: ["A template update changes a button location on every faceplate overnight, and operators press the wrong command.", "The screen object expects tag members that an older controller block does not provide, and it shows blanks."],
    v: "Update the library template in a test project and confirm every instance changes and still resolves its tags. Command each mode from the faceplate and confirm the controller block moves to the matching state.",
    dep: ["function-block-library","tag-namespace","hmi-runtime"]
  },
  "operator-input-validation": {
    s: "Checks applied to operator entries before they reach equipment: range limits, rate limits, confirmation prompts and interlock conditions that refuse unsafe or mistyped values.",
    d: "A setpoint entry is compared with its allowed range and maximum step size; critical commands require confirmation and sometimes a second person. Mode and permissive conditions block commands that are not valid in the current state. The checks run both on the screen and in the controller, since the screen can be bypassed. It is hard because too many confirmations train operators to click through them, and too few allow a fat-finger entry such as an extra zero to be executed.",
    k: ["Range checks in the HMI only versus also in the controller: HMI checks give friendly messages, but only controller checks protect against other clients, scripts and a compromised screen.", "Confirm every command versus only high-consequence ones: broad confirmation is simple, but becomes reflexive, so selective confirmation preserves attention for the dangerous commands."],
    p: ["An operator types 1000 instead of 100 and the entry is accepted because the range allows it.", "Confirmation dialogs appear for routine actions, and operators learn to press accept without reading."],
    v: "Try to enter an out-of-range setpoint and an oversized step from the HMI and from a script client, and confirm both are refused with a clear message and logged.",
    dep: ["command-write-path","function-block-library"]
  },
  "user-roles-and-access": {
    s: "The rules for who may view, acknowledge, command and configure what, tied to individual accounts, roles and areas of responsibility.",
    d: "Roles such as viewer, operator, supervisor and engineer grant sets of rights, scoped to areas so that an operator of one unit cannot command another. Authentication uses individual logins, badges or a directory service. Control rooms need fast shift changes, so sessions and logins must be quick. The system must also work if the directory is unreachable. It is hard because security rules collide with operations: a locked screen during an emergency is a hazard, so shared accounts and disabled locks creep in.",
    k: ["Individual accounts with a central directory versus local accounts on each station: central gives accountability and revocation, but needs a local fallback or the plant cannot log in when the directory is down.", "Strict timeouts versus operator-friendly sessions: timeouts reduce unattended access, but should not lock the screen of an operator watching a process."],
    p: ["A shared operator login hides who made a change and is never rotated.", "The directory server fails and no one can log in on the control room stations during a shift change."],
    v: "Log in as an operator of one area and confirm commands to another area are refused. Disconnect the directory and confirm a defined fallback account can still log in, and that its use is logged.",
    dep: ["audit-trail","zones-and-conduits"]
  },
  "remote-clients": {
    s: "Thin clients, web views and mobile apps that let engineers and managers view or sometimes control the process from outside the control room.",
    d: "A remote client connects to a gateway that serves displays and values, often read-only, using a web interface or remote desktop to a station inside the plant. Rights are narrower than on the control room consoles, and commands are often disabled. Connections cross the demilitarized zone. It is hard because remote access widens the attack surface, and because a view of the plant on a phone invites decisions that need the context of the control room.",
    k: ["Remote desktop to an inside station versus a purpose-built web client: remote desktop reuses the existing screens, but exposes a full workstation, while a web client exposes only data.", "Read-only versus command rights remotely: read-only is much safer, but forces a trip to site for an urgent action."],
    p: ["Remote commands are enabled for convenience and a stolen credential can now move equipment.", "A web view shows data without the stale marking that the control room screen has."],
    v: "Log in from outside the plant with a valid account and confirm only the intended displays are visible, commands are refused, and the session appears in the remote access log with source address and duration.",
    dep: ["remote-access-gateway","industrial-dmz","user-roles-and-access"]
  },
  "alarm-engine": {
    s: "The service that evaluates conditions on live values, raises alarms with priority, tracks their state through acknowledge and return to normal, and distributes them to displays and logs.",
    d: "Each alarm has a source tag, a condition such as high or deviation, a deadband, a delay and a priority. The engine runs a state machine: active unacknowledged, active acknowledged, cleared unacknowledged, and normal. It records every transition with a time, feeds the alarm list and the historian, and applies suppression and shelving rules. It is hard because conditions flicker near thresholds, so on-delays and deadbands are needed, and because the list during an upset must stay ordered and readable.",
    k: ["Alarm evaluation in controllers versus in the server: controller evaluation timestamps close to the event and survives server loss, but spreads configuration over many devices.", "On-delay and deadband versus raw thresholds: delays remove chattering alarms, but add latency to a real fast excursion, so each must be set per signal."],
    p: ["A noisy signal near a limit generates hundreds of repeated alarms until the list is useless.", "An alarm is acknowledged by someone who never looked at it and the condition is then forgotten."],
    v: "Ramp a test signal slowly across its limit and back, and confirm one alarm is raised and cleared with correct times, no chatter, and each state transition appears in the alarm log.",
    dep: ["real-time-tag-database","alarm-rationalization","audit-trail"]
  },
  "alarm-rationalization": {
    s: "The review that decides, for each alarm, whether it is needed, what it means, what the operator should do, how soon, and at what priority.",
    d: "A team of operators, process and control engineers walks through every proposed alarm and records its cause, consequence, expected action and response time. An alarm without a required action is removed or turned into a message. Priorities are assigned by consequence and time available, and limits are set accordingly. The results live in a master alarm database. It is hard because it is tedious, and because without it plants accumulate alarms added after each incident until operators ignore most of them.",
    k: ["Full rationalization versus incremental cleanup of the worst offenders: full review yields a coherent system, but takes months, while targeting top offenders gives faster gains and leaves the long tail.", "Fixed priority distribution versus judging each alarm: a distribution target keeps priorities meaningful, but may push a borderline alarm into the wrong class."],
    p: ["Alarms are added for every incident and never removed, so the count grows until operators stop reading.", "The rationalization results are in a spreadsheet and never loaded into the system, so settings never change."],
    v: "Select ten alarms at random and confirm each has a documented cause, consequence and operator action in the master database, and that the limit and priority on the live system match it.",
    dep: ["alarm-engine","asset-model"]
  },
  "shelving-and-suppression": {
    s: "Controlled ways to quiet alarms that are known, irrelevant or caused by another event: operator shelving for a period, state-based suppression and flood protection.",
    d: "Shelving lets an operator hide a chattering or failed-instrument alarm for a limited time with a reason, visible in a shelved list. State-based suppression automatically hides alarms that cannot be meaningful in the current state, such as low-flow alarms on a stopped pump. Flood suppression collapses cascades from one root cause. It is hard because every suppression is a way to miss a real alarm, so it needs expiry, visibility, audit and review.",
    k: ["Time-limited shelving versus permanent disablement: expiry brings the alarm back for a decision, but can reintroduce nuisance alarms the operator must reshelve.", "Automatic state-based suppression versus manual: automatic keeps displays clean through start-up and shutdown, but wrong state logic hides alarms that matter."],
    p: ["Shelved alarms are not listed anywhere, and a shelved high-level alarm is still shelved when the tank overflows.", "Suppression logic depends on a mode flag that is itself wrong during a fault."],
    v: "Shelve a test alarm with a reason and a one-hour limit, and confirm it appears in the shelved list, is audited, and returns to active automatically at expiry if the condition still exists.",
    dep: ["alarm-engine","user-roles-and-access","audit-trail"]
  },
  "annunciation-and-notification": {
    s: "How alarms reach people: sound and flashing on consoles, hardwired annunciator panels, and messages to pagers or phones for people away from the control room.",
    d: "Priority drives how an alarm is presented: sound pattern, color, position in the list. Critical conditions may use a hardwired panel that works without the computer system. Escalation sends unacknowledged alarms to a supervisor after a delay or to on-call staff outside the plant. It is hard because the paths are independent systems with their own failures, and because sound design must be distinguishable from many alarms at once and from nearby equipment noise.",
    k: ["Hardwired annunciator for critical alarms versus software only: hardwired panels survive a computer failure, but cost wiring and are inflexible to change.", "Notification to personal phones versus control-room only: phones reach people away, but add a path with no acknowledgment standard, and may leak operational data."],
    p: ["Notifications go to a person who left the site last month and are never acknowledged.", "All priorities use similar sounds, and operators cannot tell a critical alarm from a low one by ear."],
    v: "Raise a critical test alarm and confirm sound, list entry and annunciator each occur within the target time. Leave it unacknowledged and confirm it escalates to the named supervisor.",
    dep: ["alarm-engine","digital-io-modules"]
  },
  "alarm-performance-metrics": {
    s: "Measurements of how well alarm management works: alarms per operator per hour, peak rates, stale alarms, most frequent alarms, and the time spent in flood.",
    d: "The alarm log is analyzed periodically against targets for average rate, share of time above a flood threshold, how many alarms stay active for long, and how many sources produce most of the alarms. The worst offenders are reviewed first. Reports go to operations and engineering managers. It is hard because the numbers describe the system, not the operator's real workload, and good metrics can be reached by suppressing alarms that needed attention.",
    k: ["Rate-based targets versus workload analysis: rates are easy to compute and compare, but ignore how hard each alarm is to respond to.", "Regular management review versus ad hoc analysis: regular review drives sustained improvement, but needs ownership that survives staff changes."],
    p: ["The target is met by raising limits, not by fixing causes, and real warning time shrinks.", "Metrics are computed from the historian instead of the alarm log and miss alarms that never changed a stored value."],
    v: "Produce the monthly report from the alarm log, check the top five alarm sources against the raw log counts, and confirm each has an action item with an owner.",
    dep: ["alarm-engine","process-historian"]
  },
  "sequence-of-events": {
    s: "High-resolution time-stamped recording of discrete changes across many points, used after a trip to establish exactly which event came first and what caused what.",
    d: "Inputs are time-stamped at the module or controller to millisecond or better precision against a common synchronized clock, and gathered into one ordered list. After a trip, engineers read the list to find the first event, such as a low-pressure switch, from the cascade that followed. It is hard because ordering across devices requires clocks synchronized to better than the event spacing, and because ordinary alarm timestamps added at the server cannot resolve the sequence.",
    k: ["Timestamp at the input module versus at the controller scan: module stamps give sub-millisecond ordering independent of scan time, but need special hardware.", "Dedicated SOE recorders versus the general alarm system: dedicated recorders keep their precision and are not flooded, but add another system to maintain."],
    p: ["Events are stamped at server arrival, so a cascade of twenty events shows the same second and the first cause is invisible.", "A controller clock drifts by tens of milliseconds and reverses the apparent order of two events."],
    v: "Trip a test input pair with a known 5 ms spacing and confirm the recorder lists them in the correct order with the correct difference between their stamps.",
    dep: ["data-trust-and-time","digital-io-modules","controller-cpu"]
  },
});
