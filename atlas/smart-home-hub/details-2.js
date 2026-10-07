// Details for the smart home hub plate, part 2: automation, energy, device model.
ATLAS.details("smart-home-hub", {
  "trigger-engine": {
    s: "Watches the event bus, clock and external inputs and starts the right rules when an event matches, such as motion detected, a button press or sunset.",
    d: "Rules register the events they care about, and the engine indexes them by entity and event type so a state change finds its candidates without scanning every rule. Triggers can match a state change, a threshold crossing, a duration held for a time, a device event like a button press, a time, or an incoming webhook. Matching creates a run with the event as context. It is hard because event bursts, restarts and flapping sensors must not cause missed or duplicated runs, and the engine must be cheap enough to run on small hardware.",
    k: ["Indexed event matching vs evaluating every rule on every event: an index scales to hundreds of rules, but must be rebuilt consistently when rules change.", "Trigger on change vs trigger on state: change triggers fire once, but miss a condition that was already true when the rule was loaded."],
    p: ["A sensor that reports the same value every few seconds retriggers a rule continuously if the trigger matches reports instead of changes.", "Rules loaded after a restart miss a condition that became true while the hub was down."],
    v: "Fire a motion event ten times in one second and confirm one run starts according to the rule's mode, then restart the hub mid-sequence and confirm no rule fires spuriously on startup.",
    dep: ["state-event-bus","rule-format","schedules-and-solar-time"]
  },
  "condition-evaluation": {
    s: "Checks whether the home is in the right situation for a triggered rule to proceed, using state, time, presence and arbitrary expressions.",
    d: "After a trigger, conditions are evaluated against the current state store: entity states, numeric ranges, time windows, day of week, who is home and combinations with and, or and not. Templates can compute values from several entities. Evaluation reads a consistent snapshot rather than values changing mid-check. It is hard because it must be fast and side-effect free, and because unavailable entities force a choice: treat the condition as false, true or an error, and the wrong default quietly changes behavior.",
    k: ["Unknown treated as false vs raised as an error: false keeps rules quiet during outages, but hides broken devices; errors surface faults but can stop all automation.", "Expression templates vs fixed condition types: templates are flexible, but are harder to validate, edit visually and secure."],
    p: ["A condition that reads a stale value acts on a room that was occupied an hour ago.", "A template referencing a renamed entity evaluates to empty and silently passes."],
    v: "Set a rule to run only when nobody is home, trigger it with a person home and with the presence sensor unavailable, and confirm it is skipped in the first case and follows the documented default in the second.",
    dep: ["state-store","presence-detection","availability-tracking"]
  },
  "action-executor": {
    s: "Runs the steps of a rule in order: sending commands, waiting, branching, repeating and calling other rules, and handling devices that fail to respond.",
    d: "The executor interprets a sequence of actions: call a service on an entity, delay, wait for a state with a timeout, choose a branch, repeat until a condition, run in parallel, or call a scene. Commands go to the protocol adapter and are confirmed against reported state where the device supports it. A run keeps its context, so errors can be reported with the step. It is hard because physical actions fail partly: three lights respond and one does not, and the sequence must decide whether to continue, retry or stop.",
    k: ["Continue past a failed step vs abort the run: continuing makes best-effort scenes work, but may leave the home in an inconsistent state in a sequence that needed all steps.", "Fire-and-forget commands vs waiting for confirmation: fire-and-forget is fast, but cannot tell a lamp that never turned on."],
    p: ["Long delay steps held in memory vanish on restart, so a promised turn off after ten minutes never happens.", "Retrying a toggle command without checking state flips a device back after a lost acknowledgment."],
    v: "Run a sequence that turns on four lights, waits two seconds and dims them, with one light unplugged, and confirm the failure is recorded with its step, the other lights complete and the run's final status is partial.",
    dep: ["protocol-adapters","state-store","capability-schema"]
  },
  "rule-format": {
    s: "The declarative, versioned file format in which rules, scenes and schedules are stored, so they can be edited by hand, shared, diffed and validated.",
    d: "Rules are stored as structured text with triggers, conditions and actions referring to entities by stable identifiers, not by display names. A schema validates files on load and gives line-level errors, and each file carries a format version so older rules are migrated automatically. Templates and variables allow reuse. It is hard because the format becomes a public contract: users share files and write them by hand, so changes must stay compatible, and references must survive device renames and replacement.",
    k: ["Stable entity identifiers vs display names: identifiers survive renames, but are unreadable to people editing files by hand.", "Declarative format vs embedded scripts: declarative rules can be validated and shown visually, but complicated logic eventually needs an escape hatch."],
    p: ["Rules that refer to a device by network address break when the device is replaced and gets a new address.", "A silent schema change makes shared rule files from last year load with different meanings."],
    v: "Load a rule file written for the previous format version and confirm it is migrated with a recorded backup, then load a file with a deliberate error and confirm the message names the line and the rule stays disabled.",
    dep: ["entity-model","embedded-database"]
  },
  "visual-rule-editor": {
    s: "A graphical editor in which residents build triggers, conditions and actions by picking devices and options, without writing the rule format directly.",
    d: "The editor reads the capability schema to offer only valid choices: a light offers brightness and color, a lock offers lock and unlock. It writes the declarative rule format, can switch to a text view, and highlights the last run and the reason a rule did or did not fire. A test run executes actions after confirmation. It is hard because it must make a powerful language approachable, show why a rule behaved unexpectedly, and not lose the details of hand-edited rules that it cannot display.",
    k: ["Capability-driven choices vs free-form fields: choices prevent invalid rules, but hide device features the schema does not describe.", "Round-trip with hand-edited text vs one-way import: round-trip lets power users mix both, but the editor must preserve things it cannot render."],
    p: ["An editor that rewrites a hand-edited rule and drops unknown fields destroys a user's careful work.", "Rule traces showing only that a rule did not run give no help finding the failed condition."],
    v: "Build a motion-activated light rule in the editor, run it with the test button, then open the text view, change one value, save, and confirm the editor shows the change and the rule trace names each condition's result.",
    dep: ["rule-format","capability-schema","device-registry"]
  },
  "scenes": {
    s: "A named snapshot of target states for several devices, such as movie night, applied together and optionally reversed afterward.",
    d: "A scene stores desired values per entity, such as brightness, color and thermostat setpoint, and applies them in parallel with a transition time. Capturing a scene records current states, and restoring one returns devices to the earlier state. Applying a scene sends commands through the executor and tracks which devices confirmed. It is hard because devices are heterogeneous and unreliable: lights turn on at different speeds, some ignore transitions, and a mesh flooded with many commands drops some of them, so scenes look ragged without staggering and retry.",
    k: ["Group command vs individual commands: group commands apply together and use less radio traffic, but only work on devices in the same group and protocol.", "Store absolute values vs relative changes: absolute states are predictable, but ignore what a device was doing before and cannot adapt to daylight."],
    p: ["Applying a scene to twenty lights at once floods the mesh and leaves several at the old value.", "A scene that includes a device since replaced applies partially and gives no error."],
    v: "Apply a twelve-light scene with a transition and confirm all lights reach the target values within the time limit, reported by their state, and capture and restore the previous scene without drift.",
    dep: ["action-executor","entity-model","protocol-adapters"]
  },
  "schedules-and-solar-time": {
    s: "Time-based triggers including fixed times, repeating intervals and events computed from sunrise and sunset at the home's location, with correct handling of time zones and daylight saving.",
    d: "The scheduler keeps a queue of next fire times, computed from calendars and from astronomical calculation given latitude, longitude and date, with optional offsets such as thirty minutes before sunset. It reacts to clock jumps from network time or daylight saving by recomputing, and decides what to do about triggers missed while the hub was off. It is hard because wall-clock time is not monotonic, local days have twenty-three or twenty-five hours, and a missed schedule might need to be caught up or skipped.",
    k: ["Run missed schedules on restart vs skip them: catching up preserves intent for a heating on, but a stale lights-off at midnight run at noon is wrong.", "Wall-clock scheduling vs monotonic timers: wall clock matches human expectations, but needs recomputation when time is corrected."],
    p: ["A schedule at 02:30 on the daylight saving change day runs twice or never.", "A hub that boots with the wrong clock before network time arrives fires a day's schedules at once."],
    v: "Set the clock across a daylight saving boundary in a test and confirm a 02:30 schedule runs once, and compare computed sunset against a reference table for the configured location within one minute.",
    dep: ["clock-sync","embedded-database"]
  },
  "mode-state-machines": {
    s: "Named house modes such as home, away, night and vacation, with defined transitions and what each mode changes, so many rules can share one idea of the situation.",
    d: "A mode is a state in a small state machine kept in the state store, changed by presence, schedules, voice or buttons. Rules refer to the mode in conditions instead of repeating presence and time logic, and entering or leaving a mode runs its entry and exit actions. Priority and manual override rules decide which source wins. It is hard because modes interact: an away mode set by presence must not undo a vacation mode set by hand, and conflicting sources need explicit precedence.",
    k: ["Shared house modes vs per-rule logic: modes keep behavior consistent and rules short, but make the mode itself a critical, single point of failure.", "Manual override that persists vs expires: persisting respects the person, but forgotten overrides block automation for weeks."],
    p: ["Two automations changing the mode on different signals fight each other and flip the house between home and away.", "A mode with no exit path or expiry keeps heating on economy long after the vacation ended."],
    v: "Trigger away through presence and confirm entry actions run once, then set vacation by hand and arrive home and confirm the mode stays vacation until it is cleared by the owner.",
    dep: ["state-store","presence-detection","trigger-engine"]
  },
  "run-concurrency-modes": {
    s: "The rule for what happens when a rule is triggered again while it is still running: ignore the new run, queue it, restart, or run in parallel.",
    d: "Each rule declares a mode. Single ignores a new trigger while running, restart cancels the current run and begins again, queued runs one after another with a limit, and parallel runs simultaneously. The executor tracks active runs, enforces limits and cancels delays and waits cleanly. It is hard because the right mode depends on the purpose: a motion light that should reset its timer needs restart, while a notification should be queued or single, and parallel runs on one device race each other.",
    k: ["Restart vs single: restart extends a motion timer on repeated movement, but also cancels half-finished sequences that needed to complete.", "Queue with a cap vs unbounded queue: a cap protects memory when a trigger floods, but drops runs that mattered."],
    p: ["Parallel runs that both toggle a light leave it in a random state depending on timing.", "A default of single makes a motion-activated light turn off while someone is still in the room."],
    v: "Trigger a ten-minute motion light rule at minutes zero and nine and confirm restart mode turns the light off at minute nineteen, while single mode turns it off at ten.",
    dep: ["action-executor","trigger-engine"]
  },
  "loop-and-conflict-guard": {
    s: "Detects automations that trigger each other in a cycle or issue opposing commands, and limits their rate so one mistake cannot saturate the radio or flip a relay repeatedly.",
    d: "The guard tracks the context chain of each action: a run started by an event caused by another run carries its parent, so cycles are visible and depth is bounded. It also rate-limits commands per device and per rule and flags opposing commands issued within a short window, such as on and off from two rules. Detected loops disable the rule and notify the owner. It is hard because legitimate fast sequences exist and a guard that is too eager breaks them, while one that is too lax lets a loop wear out a relay.",
    k: ["Disable the offending rule vs only throttle: disabling stops harm at once, but turns a bug into an outage for a rule that was mostly right.", "Per-device rate limits vs per-rule limits: device limits protect hardware regardless of source, but one noisy rule can starve others of that device."],
    p: ["Two rules, one turning a light on when it is dark and one turning it off when it is bright, oscillate as the light itself changes the sensor reading.", "A loop through a cloud integration burns request quota before anyone notices."],
    v: "Create two rules that toggle each other and confirm the guard stops the chain after the configured depth, disables the rule, and sends a notification naming both rules.",
    dep: ["action-executor","state-event-bus","notifications"]
  },

  "energy-metering": {
    s: "Collects power and energy readings from the main meter, circuit monitors and smart plugs, converting them to consistent units with sampling and gaps handled.",
    d: "Sources include a utility meter interface, clamp sensors on the electrical panel, and plugs that report watts. Readings arrive as instantaneous power or cumulative energy counters. The component integrates power into energy, handles counter resets and rollovers, and records per-circuit and total series. It is hard because sources disagree and drift, counters reset when a device reboots, and a missing sample must not create a spike or a negative value in the daily totals.",
    k: ["Cumulative counters vs integrating power samples: counters survive gaps in polling, but reset on device reboot; integration is robust to resets, but loses energy during gaps.", "Metering at the panel vs at every plug: panel metering is cheap but coarse; per-plug metering identifies loads at the cost of many devices."],
    p: ["A plug that reboots and restarts its counter from zero produces a huge negative delta that corrupts the day's totals.", "Summing per-device readings and the main meter double counts loads that sit on both."],
    v: "Run a known thousand-watt heater for one hour and confirm the recorded energy is within the meter's tolerance of one kilowatt-hour, then power-cycle the plug mid-run and confirm totals stay continuous.",
    dep: ["value-normalization","history-recorder","entity-model"]
  },
  "tariff-model": {
    s: "Describes what electricity costs and when: flat, time-of-use, tiered, dynamic hourly prices and export rates, so other components can plan around price.",
    d: "A tariff is a schedule of periods with rates, plus fixed charges, seasonal changes, tiers that change after a consumption threshold and a feed-in rate for exported energy. Dynamic tariffs are fetched from a provider as a day-ahead price list. The model answers questions such as what is the price now and the cheapest three-hour block tonight. It is hard because tariffs are complicated and change, so the model needs to be editable by the owner, and a fetched price can be missing or late.",
    k: ["Fetched dynamic prices vs a manually entered schedule: fetched prices track the market, but add a cloud dependency and a missing-data case.", "Marginal-cost optimization vs simple peak avoidance: modeling real tiers saves more, but is only worth it where the tariff really is that structured."],
    p: ["A tariff entered once and never updated makes savings reports wrong after the provider changes rates.", "Missing day-ahead prices treated as zero cause every flexible load to run at once."],
    v: "Load a three-period time-of-use tariff and confirm the model returns the right price at boundary times and the right cheapest window, then drop the price feed and confirm it falls back to the stored schedule.",
    dep: ["energy-metering","cloud-sync","schedules-and-solar-time"]
  },
  "load-shedding": {
    s: "Reduces or delays selected loads when total demand approaches a limit, such as the main breaker rating or a peak-price period, restoring them afterward.",
    d: "Loads are ranked by priority and flexibility: refrigeration is never shed, water heating can pause for an hour, car charging can slow. The component compares live demand to a limit and sheds the lowest priority loads first, with minimum on and off times to protect compressors. It restores gradually to avoid a new peak. It is hard because shedding must be fast enough to prevent a breaker trip yet slow enough to avoid cycling devices, and devices that are not controllable limit what it can do.",
    k: ["Priority-ordered shedding vs proportional reduction: priority is simple to explain, but may punish one load entirely; proportional sharing needs loads that can modulate.", "Hysteresis and minimum off time vs fast restoration: they protect motors, but delay comfort after the peak is over."],
    p: ["Restoring all shed loads at the same moment creates a second peak that trips the breaker.", "Shedding a heat pump compressor with no minimum off time damages it through short cycling."],
    v: "Set a low demand limit, start the oven and car charger, and confirm the charger throttles first, demand stays under the limit, and loads restore one at a time after demand falls.",
    dep: ["energy-metering","action-executor","entity-model"]
  },
  "solar-and-battery-coordination": {
    s: "Balances solar production, home battery and grid import and export, deciding when to charge, discharge or run flexible loads on surplus generation.",
    d: "The coordinator reads production, battery state of charge, consumption and the tariff, and sets battery charge and discharge limits or modes through the inverter's interface. It can use forecasts of sun and demand to plan the day and reserves capacity for outages. Surplus triggers automations such as heating water. It is hard because inverters have their own control logic and limits, forecasts are wrong, and changes made by two controllers, hub and inverter, can fight each other.",
    k: ["Hub-controlled battery vs inverter's own mode: hub control optimizes for tariff and the house's rules, but conflicts with the manufacturer's logic and warranty terms.", "Forecast-driven plan vs reactive thresholds: plans save more, but fail on a cloudy day unless they replan."],
    p: ["Draining the battery to profit from a price peak leaves no reserve when a storm cuts power.", "Writing control registers too often wears inverter flash or is rejected by the device."],
    v: "On a simulated sunny day with a price peak at evening, confirm the battery charges from surplus, discharges during the peak and holds the configured reserve, as shown by the inverter's reported state.",
    dep: ["tariff-model","energy-metering","protocol-adapters"]
  },
  "ev-charging-scheduler": {
    s: "Plans when and how fast an electric vehicle charges so it is full by departure time at the lowest cost while staying within household and circuit limits.",
    d: "The scheduler takes the departure time, required energy or target level, the tariff and the live household load, and sets the charger's current limit or start time. It can follow surplus solar, pause for load shedding and resume. Vehicle and charger report state through the charger's interface. It is hard because the vehicle controls the actual draw, chargers differ in what they allow, and the plan must handle unplugging, a change of departure and a short window with no slack.",
    k: ["Cheapest window vs start immediately: delayed charging saves money, but risks an empty vehicle if the plan or the connection fails.", "Charger-side limits vs vehicle-side control: charger limits work with any vehicle, but cannot ask the vehicle for its charge level."],
    p: ["Scheduling a start for the cheap period with no check that the charger accepted it leaves the car uncharged in the morning.", "Ignoring the shared circuit rating lets the charger and oven together trip the breaker."],
    v: "Plug in with a departure at 07:00 and a half-empty target, and confirm charging runs in the cheapest hours, adjusts when the oven starts, and the vehicle reaches the target by 07:00.",
    dep: ["tariff-model","load-shedding","protocol-adapters"]
  },
  "energy-reports": {
    s: "Summaries of consumption, production, cost and savings by device, room and period, with comparisons that help residents change their behavior.",
    d: "Reports aggregate metered series into hourly, daily and monthly values using the tariff for cost, and break usage down by circuit, device or category. Long-term statistics are stored compactly so years remain available. Reports compare against previous periods and weather and export data in standard formats. It is hard because the numbers must agree across views and with the utility bill, and the data has gaps and corrections that need explaining instead of being silently smoothed.",
    k: ["Precomputed rollups vs computing on demand: rollups make long ranges fast on small hardware, but fixing past data needs recomputation.", "Estimating missing intervals vs showing gaps: estimates give clean charts, but hide faults that residents should fix."],
    p: ["Daily totals that disagree with the monthly figure erode trust in every number shown.", "Time zone handling errors place a midnight peak in the wrong day on a daylight saving change."],
    v: "Compare the monthly report total and cost for one circuit against the utility bill within the meter's tolerance, and confirm the daily values sum to the monthly figure.",
    dep: ["history-recorder","tariff-model","energy-metering"]
  },

  "device-registry": {
    s: "The authoritative list of every device known to the hub: its identity, make, model, firmware, protocol address, owner area and the entities it exposes.",
    d: "Each device gets a stable internal identifier independent of its radio address, with manufacturer data, hardware and firmware versions, the integration that manages it and links to its entities. The registry is persisted so devices survive restarts and names and areas the user set are kept when the device is re-paired or replaced. It is hard because identity is slippery: a device that changes address, resets or is replaced by a newer model must be matched to its old self so that rules, history and names carry over.",
    k: ["Stable internal ids vs protocol addresses as ids: internal ids survive re-pairing, but need a matching step to recognize a returning device.", "Registry owned by the core vs by each integration: a core registry gives uniform names and areas, but integrations lose freedom over their own data."],
    p: ["Using a radio address as the identity breaks all rules when the device re-pairs and gets a new address.", "A registry corrupted by power loss during a write loses every device name at once."],
    v: "Factory reset and re-pair a device and confirm it returns under its old identifier with its name, room and history intact, and survives a hub power cut during a rename without data loss.",
    dep: ["embedded-database","entity-model"]
  },
  "entity-model": {
    s: "The common abstraction of one controllable or observable thing, such as a light, a temperature sensor or a lock, with a type, a state, attributes and supported commands.",
    d: "A device exposes one or more entities, each of a defined type with a state value and attributes, plus the commands it accepts. The type fixes the vocabulary: a light has on, brightness and color, a lock has locked and unlocked. Integrations map their protocol's features into entities and everything else uses the entities only. It is hard because the model must be general enough for thousands of devices and specific enough for rules and voice to work with them, and manufacturers add features that fit no type.",
    k: ["Fixed entity types vs free-form attributes: fixed types allow validation, voice and generic UI, but lag behind new device features; free-form is flexible, but every client must guess.", "One entity per function vs one entity per device: per-function entities map cleanly to rules, but multiply the count shown to users."],
    p: ["Mapping an unfamiliar device to the nearest type loses features and misleads the UI about what it can do.", "State attributes without units make a thermostat's setpoint ambiguous between degrees of two scales."],
    v: "Pair a multi-function device, such as a dimmable light with a motion sensor, and confirm it appears as the right entities with correct commands and that a rule can use each one without protocol details.",
    dep: ["capability-schema","device-registry"]
  },
  "capability-schema": {
    s: "A machine-readable description of what a device type can do: its commands, value ranges, units and optional features, used to validate commands and drive generic interfaces.",
    d: "Schemas list for each entity type the attributes with types, ranges, units and step sizes, the commands with parameters, and which features are optional or supported by this particular device. Interfaces, the rule editor and voice use the schema to show only valid choices, and the executor uses it to reject out-of-range commands before they reach a radio. It is hard because it must track standards that evolve, vendor extensions and devices that report capabilities inaccurately.",
    k: ["Schema from the standard vs from observed device behavior: the standard is authoritative, but real devices deviate; observation adapts, but may encode bugs.", "Strict validation vs tolerant passthrough: strict rejection prevents bad commands, but blocks legitimate vendor features the schema lacks."],
    p: ["A schema that allows brightness up to 100 for a device that accepts 0 to 254 produces dim lights that seem broken.", "Treating declared capabilities as truth sends commands the device claimed to support but ignores."],
    v: "Send an out-of-range brightness and an unsupported color command to a white-only lamp and confirm both are rejected with a clear error before any radio frame is sent.",
    dep: ["entity-model"]
  },
  "state-store": {
    s: "The in-memory current state of every entity, with the time of last change, who caused it and a consistent snapshot interface for rules and clients.",
    d: "State is held in memory for speed and updated by adapters when devices report. Each update records old and new values, a timestamp and the context of the command that caused it, then is published on the event bus and handed to the history recorder. Readers can take consistent snapshots. After a restart, the store is rebuilt from last known state marked uncertain until devices report. It is hard because state is a belief about the physical world, which is changed by people at wall switches and may be out of date.",
    k: ["Reported state vs optimistic commanded state: reported state reflects reality, but lags; optimistic state feels instant and is wrong when commands fail.", "Restore last state on restart vs start unknown: restoring keeps dashboards populated, but shows possibly wrong values as if confirmed."],
    p: ["Restored state presented without a stale marker shows a door locked that was opened while the hub was off.", "Treating a device's last command as its state ignores changes made by hand."],
    v: "Flip a light at its wall switch and confirm the stored state and timestamp update with an origin of physical, and restart the hub and confirm restored values are marked unconfirmed until reported.",
    dep: ["entity-model","protocol-adapters","state-event-bus"]
  },
  "state-event-bus": {
    s: "The internal publish and subscribe channel that announces every state change, device event and command, so automations, interfaces and recorders react without knowing each other.",
    d: "Components publish typed events and others subscribe by type and entity. Delivery is in order per entity, in process and non blocking, and events carry a context identifier linking cause and effect. Subscribers that are slow must not stall publishers, so queues are bounded and policy decides what to drop. It is hard because the bus is the shared spine: a handler that blocks or throws can freeze the hub, and an event storm from a misbehaving device can swamp everything.",
    k: ["Bounded queues that drop vs unbounded queues: bounded protects memory and latency, but drops events that a rule may need; unbounded keeps all and risks running out of memory.", "In-process bus vs external message broker: in-process is fast and simple, but ties all subscribers to one process and its crashes."],
    p: ["A subscriber that performs a slow network call inside its handler delays every other subscriber.", "Event ordering not guaranteed across entities makes a rule see an effect before its cause."],
    v: "Publish a thousand events per second from a simulated chatty sensor and confirm event latency to the automation engine stays within the limit, the drop counter shows what was shed, and the rest of the hub remains responsive.",
    dep: ["state-store"]
  },
  "areas-and-rooms": {
    s: "The hierarchy of floors, rooms and zones that places devices in the physical home, used for control, voice context and permissions.",
    d: "Areas form a tree, such as house, floor, room, with devices and sometimes single entities assigned to them. Area names allow commands like turn off the upstairs lights, scope permissions and dashboards, and give voice satellites their location. Assignments live in the registry and survive device replacement. It is hard because the physical house is messy: a device may serve two rooms, an outdoor light belongs to no room, and renaming or restructuring areas must update every rule and layout that depends on them.",
    k: ["One area per device vs multiple: one area is simple and unambiguous, but can't model a hallway light that is shared between rooms.", "Area-based rules vs device lists: area rules adapt when devices are added, but may include a device the owner did not intend."],
    p: ["A new light added to the living room silently joins every living room rule and turns on at 3 a.m.", "Moving a device between areas without updating dashboards leaves it controlling the wrong room."],
    v: "Move a lamp from one room to another and confirm room scenes, voice commands and permissions now apply to the new room, and that the rule trace shows the lamp as a member.",
    dep: ["device-registry","entity-model"]
  },
  "value-normalization": {
    s: "Converts raw device values to consistent units, ranges and types, such as temperatures in one scale, brightness as a percentage and colors in one color space.",
    d: "Each adapter reports in the device's native form: tenths of a degree, 0 to 254 levels, mireds, scaled integers. Normalization converts to the model's units on input and back on output, applies rounding and filters out impossible values. User preferences convert only at the display. It is hard because lossy round trips change values the user set, devices report in different resolutions, and a bad sensor can emit obviously wrong readings that must be discarded without hiding a real fault.",
    k: ["Normalize at the adapter boundary vs at display time: boundary conversion keeps everything inside consistent, but loses the raw value unless it is kept alongside.", "Reject outliers vs pass through: rejecting hides bad readings from rules, but may suppress a real extreme such as a fire."],
    p: ["Rounding brightness to a percentage and back moves a lamp's level each time a scene is saved and restored.", "Unit confusion between Celsius and Fahrenheit in one integration doubles a thermostat setpoint."],
    v: "Feed raw values from three sensor types into the adapter and confirm the stored values and units are correct, a round trip returns the same raw value, and an impossible reading is flagged without altering state.",
    dep: ["capability-schema","protocol-adapters"]
  },
  "availability-tracking": {
    s: "Determines whether each device is reachable, from heartbeats, response to commands and protocol signals, so the rest of the system can tell offline from unchanged.",
    d: "Each device has an expected reporting behavior: mains-powered devices answer polls, battery sensors report on a schedule, sleepy devices check in rarely. The tracker marks a device unavailable after a tolerance specific to its class and signals when it returns. State of unavailable devices is shown as unknown rather than last value. It is hard because silence has many causes: a dead battery, a moved router, a congested mesh or a hub fault, and a tolerance too short flaps while one too long hides outages.",
    k: ["Per-class timeouts vs one global timeout: per-class values match devices that report hourly, but need correct metadata for each class.", "Active polling vs passive listening: polling detects failures quickly, but drains batteries and adds radio traffic."],
    p: ["A sensor shown with its last reading for days after its battery died drives heating on false data.", "A global timeout marks every sleepy device unavailable each night and floods notifications."],
    v: "Remove the battery from a sensor and confirm it is marked unavailable within its class tolerance, its state shows unknown, a low-battery or offline alert is raised, and recovery is reported when power returns.",
    dep: ["state-store","protocol-adapters","notifications"]
  },
  "history-recorder": {
    s: "Writes state changes to local storage with retention and compaction rules, so charts, timelines and rules that look back in time have data.",
    d: "The recorder subscribes to the event bus and batches writes to the embedded database, skipping attributes that change constantly, such as signal strength, and entities the user excluded. Retention keeps recent detail and compacts older data into statistics. Queries serve charts and timelines. It is hard because flash storage wears out under constant writes and small hardware is slow, so batching, filtering and compaction must keep the write rate low without losing the events residents care about.",
    k: ["Record every change vs sample on an interval: every change is accurate for events, but writes heavily; sampling saves writes but misses short events.", "Store attributes with state vs state only: full records help debugging, but increase size and write volume for little value."],
    p: ["Recording a noisy attribute such as signal strength every second wears out the flash within months.", "A purge job holding a long lock freezes the history view and delays writes."],
    v: "Run a week of simulated activity with twenty chatty sensors and confirm the write volume per day stays under the stated limit, queries return within the target, and database size stabilizes under retention.",
    dep: ["embedded-database","state-event-bus","storage-wear-management"]
  },
});
