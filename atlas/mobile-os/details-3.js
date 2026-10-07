// Details for the mobile operating system plate, part 3: background work and push, media and camera, location and telephony.
ATLAS.details("mobile-os", {
  "job-scheduler": {
    s: "A system service that runs deferrable background work when its conditions are met, such as network type, charging state and idle time, batching jobs from many apps into shared wake windows.",
    d: "Apps submit a job with constraints, a deadline and a back-off policy. The scheduler tracks device state, waits until constraints hold, and wakes the app's service to run the job within a time limit. Because it sees all apps, it can run many jobs in one awake period instead of waking the device repeatedly. Quotas stop abusive apps. It is hard because jobs must be durable across reboots and app updates, and because too many constraints mean a job may never run.",
    k: ["Constraint-based deferred jobs vs exact timers: constraints let the system batch and save power; apps lose control of exactly when work occurs.", "Per-app execution quotas vs unlimited jobs: quotas protect battery from misbehaving apps; legitimate sync-heavy apps may be starved in lower standby buckets."],
    p: ["A job with an unsatisfiable constraint combination, such as unmetered network plus charging, may never run for a user who is rarely on both.", "Jobs that exceed their run-time limit are stopped mid-work and rescheduled, repeating the same partial progress."],
    v: "Schedule a job requiring charging and unmetered network, then plug in and connect: confirm it runs once within the batching window, and that with the app in a restricted bucket it runs less often but still runs.",
    dep: ["standby-buckets", "background-limits-policy", "idle-state-manager", "battery-attribution"]
  },
  "alarm-service": {
    s: "Timers that fire at a wall-clock time or after an interval, waking the device if needed, used for clocks, reminders and calendar events.",
    d: "Apps ask the alarm service to deliver a pending request at a time. The service keeps a sorted list, programs the hardware timer for the earliest one, and on expiry wakes the device and delivers it. Inexact alarms are aligned with each other into batches. Exact alarms need special permission and are limited because they force wakeups. Clock changes, time-zone changes and reboots must be handled so that alarms either persist or are rebuilt by apps. It is hard to keep alarms precise without breaking batching.",
    k: ["Inexact batched alarms by default vs exact on request: batching saves large amounts of power; apps needing precision, such as alarm clocks, must request and justify exact delivery.", "Alarms survive reboot only if the app re-registers vs system persists them: app re-registration keeps the service simple; apps that forget lose all scheduled events."],
    p: ["An app that sets exact alarms in a tight loop wakes the device hundreds of times a day and appears at the top of battery usage.", "Alarms based on wall-clock time fire at the wrong moment after a time zone change unless the app listens for it."],
    v: "Set an exact alarm for one minute ahead with the device in deep idle and confirm it fires within the documented tolerance; reboot with a pending alarm and confirm behavior matches the stated persistence rule.",
    dep: ["wake-locks", "idle-state-manager", "suspend-resume"]
  },
  "foreground-services": {
    s: "Long-running app work the user knows about, kept alive by a persistent notification, and allowed to continue while the app is not visible.",
    d: "An app promotes a service to the foreground by posting an ongoing notification and declaring a type such as media playback, location or data transfer. The process priority rises, and the work is exempt from most background limits. The system restricts which types need which permissions, limits starting one from the background, and may impose time limits for some types. Hard parts are abuse: apps use the mechanism for work that does not need it, and the platform must decide which uses are legitimate without breaking real ones.",
    k: ["Visible notification as the price of staying alive vs invisible background execution: visibility gives users control and lets them stop it; apps dislike a permanent notification.", "Typed services with specific permissions vs one generic type: types let policy match purpose and show an accurate label; every new use case needs a new type."],
    p: ["Starting a foreground service from the background is blocked on newer releases and crashes the app when attempted.", "A service that never stops keeps the process at high priority and drains battery long after the task ends."],
    v: "Start a media foreground service, background the app and confirm playback continues with its notification; stop the notification and confirm the process drops to cached priority and cannot continue running.",
    dep: ["notification-manager", "process-priority-states", "background-limits-policy"]
  },
  "background-limits-policy": {
    s: "The platform rules that restrict what an app may do when not visible: starting services, running tasks, receiving broadcasts, holding locks and using the network.",
    d: "When an app leaves the foreground it enters a restricted state after a short grace period. The policy then stops its background services, defers its jobs and alarms, blocks most implicit broadcasts and may cut network access. Exceptions exist for a high-priority push message, an active foreground service, and a handful of user-visible activities. The rules are stricter for apps the user rarely opens. They are hard because apps built for earlier, looser rules break in ways that look like bugs, and policy changes each release.",
    k: ["Strict limits enforced by the platform vs asking apps to behave: enforcement works regardless of developer care; it breaks old apps and pushes developers to workarounds.", "Same rules for all apps vs exemptions by category: uniform rules are fair and predictable; messaging and navigation need exceptions that become targets for abuse."],
    p: ["An app that relies on a background service to stay connected stops receiving messages unless moved to push.", "Vendor-added aggressive killers on top of the platform limits stop legitimate apps and are not documented."],
    v: "Put a test app in the background for ten minutes with a running service and confirm the service is stopped; confirm a high-priority push message still gets a short window to run.",
    dep: ["process-priority-states", "standby-buckets", "push-transport"]
  },
  "standby-buckets": {
    s: "A ranking of apps into usage tiers, from active to rare and restricted, that sets how often each may run jobs, fire alarms and receive push messages.",
    d: "A usage service watches foreground time, notification interaction and launches, and places each app in a bucket. Each bucket has quotas: for example an active app may run jobs freely, while a rare one gets a few windows per day. Buckets are re-evaluated as use changes. Apps can be placed in a restricted bucket when their battery behavior is poor. It is hard because inferring importance from usage is imperfect and invisible, so an app relied on for rare, important tasks can be deprioritized.",
    k: ["Learned usage buckets vs fixed rules per app type: usage-based tiers adapt to each person's habits; they cannot know that a rarely opened app is critical.", "Hard quotas vs soft preferences: hard quotas guarantee savings; they can delay time-sensitive work past usefulness."],
    p: ["A medication reminder app in a rare bucket has its jobs delayed past the dose time.", "Users cannot see the bucket or why it changed, so unexplained delays are blamed on the app."],
    v: "Leave an app unopened for several days on a test device and confirm it moves to a rarer bucket and its job frequency drops to the stated quota; open it and confirm it returns to active quickly.",
    dep: ["job-scheduler", "battery-attribution"]
  },
  "push-transport": {
    s: "A single persistent connection from the device to a cloud service that delivers small messages to apps, so apps do not each keep their own connection open.",
    d: "A system component holds one encrypted long-lived connection to the vendor's gateway, with keep-alives tuned to carrier network timeouts. Each app registers and receives a token; its server sends a message to the gateway, which forwards it down the connection. On arrival the component wakes the target app and hands it the payload, for a short window. Hard parts are efficiency on mobile networks, delivery when the device is offline, and rate control, since a flood of messages can wake the device constantly.",
    k: ["One shared connection vs one connection per app: sharing saves large amounts of radio power and memory; a single point of failure and policy sits between app servers and devices.", "Store and forward with expiry vs drop if offline: store and forward gives reliability for messages; stale messages such as expired alerts must be discarded using a time-to-live."],
    p: ["Tokens that change after a restore or reinstall leave the server sending to a dead address.", "Carriers that drop idle connections faster than the keep-alive interval cause unreliable delivery on certain networks."],
    v: "Send a high-priority message to a device in deep idle and confirm it arrives within seconds and wakes the app; send with a short time-to-live while offline and confirm it is not delivered after expiry.",
    dep: ["connectivity-stack", "data-connection-manager", "idle-state-manager", "notification-delivery-tiers"]
  },
  "notification-manager": {
    s: "The system service that receives posted notifications, organizes them by app, channel and importance, and decides how and where each is shown, including sound, vibration and lock-screen visibility.",
    d: "Apps post notification objects to the manager, which stores them, applies user settings per channel, ranking and grouping rules, and sends the result to the shell for display. Interaction callbacks go back to the app through pending intents. Notification listeners, such as a watch companion, may see content with explicit approval. Do-not-disturb rules suppress alerts by schedule or caller. It is hard because notifications are the most abused attention channel and also a sensitive data path, since their text can contain private content.",
    k: ["User-controlled channels vs app-controlled alert behavior: channels give users control per category; developers must design categories thoughtfully rather than one blanket setting.", "Platform ranking and grouping vs app order: platform ranking prevents one app from drowning the shade; it can bury an urgent alert from an unfamiliar app."],
    p: ["Posting all notifications on one channel leaves users with only the choice to block everything from the app.", "Notification text shown on the lock screen leaks private message content."],
    v: "Post notifications on two channels, mute one and confirm only the other alerts; set lock-screen content to hidden and confirm the text is replaced by a placeholder.",
    dep: ["notification-delivery-tiers", "system-bars-and-shade", "permission-state-store"]
  },
  "notification-delivery-tiers": {
    s: "The priority classes of push and local messages, which decide whether a message may wake the device, interrupt the user, or wait for the next maintenance window.",
    d: "A message arrives as high priority, normal priority or silent data. High priority may wake an idle device and start a brief foreground window, and is expected to produce a visible notification; normal messages are batched until the device wakes anyway. The platform tracks how often an app uses high priority without user-facing output and downgrades it. The difficulty is incentive: every developer thinks their message is urgent, so tiers must be policed by observed behavior.",
    k: ["Platform downgrade of abused high priority vs trust declared priority: downgrade protects battery and attention; legitimate urgent messages may be delayed after a bad period.", "Silent data pushes allowed to wake apps vs only visible messages: silent pushes enable sync; they are easy to use for hidden polling, so they are rate limited."],
    p: ["Messages sent as normal priority arrive minutes late when the device is in deep idle, breaking chat or call setup.", "Silent pushes used for tracking get throttled and the app then misses real updates."],
    v: "Send ten high-priority and ten normal messages to an idle device and compare arrival times: high-priority arrive within seconds; normal arrive in batches. Confirm repeated high-priority messages without notifications are downgraded.",
    dep: ["push-transport", "idle-state-manager", "standby-buckets"]
  },
  "codec-service": {
    s: "A sandboxed service that decodes and encodes audio and video on behalf of apps, using hardware blocks where available and software otherwise.",
    d: "Apps ask for a codec by type and parameters. The service picks a hardware decoder or encoder if present, otherwise a software one, and runs it in a separate restricted process so that malformed media cannot compromise the app or the system. Buffers are passed as handles to shared memory, so frames are not copied, and the same handles go to the compositor for display. It is hard because media parsers are a classic attack surface, and because hardware codecs have vendor-specific limits on size, count and format.",
    k: ["Software codecs in a sandbox vs hardware codecs: software is flexible and updatable; hardware is far more efficient for power but limited in concurrent instances and format support.", "Isolated codec process per instance vs shared process: isolation contains crashes and exploits; each process adds memory and startup time."],
    p: ["Parsing untrusted media in the app process gives a single crafted file full app privileges.", "Opening more simultaneous hardware decoders than the chip supports fails at runtime on some devices only."],
    v: "Play files of every supported format and confirm hardware decode is used for common ones with CPU use staying low; feed a corrupted stream and confirm only the codec process dies and playback fails cleanly.",
    dep: ["hal-contracts", "syscall-filtering", "surface-compositor"]
  },
  "audio-policy-routing": {
    s: "The logic that decides which output or input device each audio stream uses and at what volume, as headphones, speakers, calls and Bluetooth devices come and go.",
    d: "Every stream carries usage metadata such as media, alarm, call or notification. The policy service maps usage to a routing strategy, chooses devices from those connected, sets volume curves per stream type, and tells the audio server how to route. When a device connects or disconnects it reevaluates routes, sometimes pausing media. Hard parts are the number of cases: a call over a wired headset while an alarm fires and a recording runs, each with different expected behavior and safety limits on volume.",
    k: ["Usage-based policy vs app-selected device: usage-based policy gives consistent behavior and handles all devices; apps with unusual needs, such as pro audio, need explicit routing options.", "Per-stream volume vs one master volume: per-stream volume lets alarms stay loud while media is quiet; it makes the volume model harder to explain."],
    p: ["An alarm routed to an unplugged-but-still-connected Bluetooth device is never heard.", "Hearing-safety volume limits applied to the wrong stream cut call volume unexpectedly."],
    v: "Play media, connect headphones and confirm audio moves with no glitch and pauses on unplug; ring an alarm with headphones attached and confirm it plays on the speaker as the policy states.",
    dep: ["audio-focus", "connectivity-stack", "hal-contracts"]
  },
  "audio-focus": {
    s: "A cooperative protocol where apps request and give up the right to play sound, so a call can pause music and navigation can briefly lower it.",
    d: "An app asks for focus with a type: permanent, transient, or transient with ducking. The service tells the holder it has lost focus and what to do, such as pause or lower volume, and notifies it when focus returns. The system can enforce the result for certain cases, such as calls. Apps are expected to obey. It is hard because it is cooperative: nothing forces a music app to pause, and users blame the platform when two apps play at once.",
    k: ["Cooperative focus vs forced muting by the platform: cooperative keeps apps in control of how they pause and resume; non-compliant apps keep playing over each other.", "Ducking by the platform vs by the app: platform ducking is consistent; app ducking can fade smoothly but varies by app."],
    p: ["An app that ignores focus loss plays over a phone call.", "Not abandoning focus after finishing leaves another app muted or lowered indefinitely."],
    v: "Play music in app A and start a short voice prompt in app B with transient focus: confirm A pauses or ducks and resumes automatically afterward at its previous volume.",
    dep: ["audio-policy-routing", "media-session"]
  },
  "camera-service": {
    s: "The service that arbitrates access to cameras, enforces permissions and priorities, and manages sessions between apps and the camera hardware interface.",
    d: "Apps open a camera through the service, which checks permission, app visibility and whether a higher-priority client such as the foreground app already holds it. It configures output streams, such as preview, still and video, and passes capture requests to the hardware interface. Results and buffers come back asynchronously with metadata. The service evicts clients when priorities change. It is hard because cameras are scarce shared hardware with strict concurrency limits and many vendor behaviors, and because pointing the sensor is a strong privacy risk.",
    k: ["Priority-based eviction vs first come first served: priority gives the foreground app the camera when needed; a background app loses it abruptly.", "Per-request metadata control vs high-level modes: per-request control allows precise apps; high-level modes work for everyone but hide hardware capability differences."],
    p: ["Apps that do not handle disconnection when evicted crash during a call or a transition.", "Camera opened with the screen off by an app not in the foreground is a covert-capture path unless blocked."],
    v: "Open the camera in app A, then in app B in the foreground: confirm A is disconnected with an error callback and B receives frames; try from a background app and confirm denial.",
    dep: ["sensor-access-gating", "camera-pipeline", "permission-state-store", "hal-contracts"]
  },
  "media-session": {
    s: "A shared object through which a playing app publishes what it is playing and accepts transport commands, so lock screens, headsets, cars and watches can show and control it.",
    d: "A player creates a session, publishes metadata and playback state, and registers callbacks for play, pause, seek and skip. System controls, notifications and connected devices find the active session and send commands to it. Hardware buttons are routed to the most recently active session. The system limits which apps may control which sessions. Hard parts are keeping state accurate, since a stale position is visible everywhere, and choosing the target when several apps have sessions.",
    k: ["System-wide session objects vs app-specific remote controls: shared sessions give every controller one integration point; apps must keep published state faithful.", "Most-recently-active routing vs explicit user choice: automatic routing needs no interaction; it sometimes sends a button press to an app the user forgot."],
    p: ["A session left active after playback ends captures media buttons and blocks other players.", "Position and duration published too rarely make scrub bars and car displays jump."],
    v: "Start playback in two apps in turn and press a headset button: confirm the command goes to the most recent one; check lock-screen metadata updates within a second of a track change.",
    dep: ["audio-focus", "foreground-services", "lock-screen"]
  },
  "protected-content": {
    s: "The path that lets licensed video decrypt and display without any app or the operating system being able to read the frames, using secure decoders and protected output.",
    d: "A license server sends content keys to a trusted component in secure hardware. The encrypted stream is decoded in a secure decoder whose output buffers are accessible only to the display hardware, not the application processor's normal memory. The compositor overlays them on a protected plane, and screenshots show black. Security levels differ by device, and services decide the maximum resolution per level. It is hard because every link, from key delivery through output encryption, must stay inside protection or the whole guarantee is lost.",
    k: ["Hardware-protected path vs software decryption: hardware protects premium content and passes studio requirements; it limits resolution on weaker devices and prevents many ordinary processing features.", "Server-set quality by device level vs one quality for all: per-level quality keeps high-value content on trusted devices; it tells users why their older device streams in lower quality."],
    p: ["Screen recording or casting of a protected surface shows black, which users report as a bug.", "A device with a broken secure-hardware link silently falls back to a lower security level and a lower resolution."],
    v: "Play a protected title, take a screenshot and capture the screen: the frames must be black or blocked while playback shows normally; query the security level and confirm it matches the license's allowed tier.",
    dep: ["codec-service", "secure-hardware-keys", "surface-compositor"]
  },
  "location-fusion": {
    s: "A service that combines satellite fixes, Wi-Fi and cell observations and motion sensors into one position estimate at the lowest power that meets the request.",
    d: "Apps request location with an accuracy and interval. The fusion service chooses sources: satellite for outdoor precision, Wi-Fi and cell databases for fast coarse position, and inertial sensors to bridge gaps. It batches requests from many apps so one fix serves all. The service sends results subject to permission and precision grants. It is hard because accuracy and power trade off steeply, and because position databases built from crowd-sourced observations raise privacy questions.",
    k: ["Fused multi-source estimate vs a single raw provider: fusion is accurate indoors and cheap; the combined result hides which source is wrong when an estimate jumps.", "Server-assisted network location vs on-device only: server assistance is quick and indoors-capable; it reveals nearby networks to a service and needs connectivity."],
    p: ["Apps that ask for the highest accuracy continuously keep the satellite receiver on and top the battery list.", "Stale cached fixes returned as current cause a map to show the user in a previous city."],
    v: "Request balanced accuracy at a one-minute interval from three apps and confirm the receiver wakes once per interval, not three times; compare an indoor fix with a known position and confirm error is within the documented range.",
    dep: ["gnss-driver", "connectivity-stack", "sensor-hub", "one-time-grants"]
  },
  "gnss-driver": {
    s: "The vendor-supplied interface to the satellite positioning receiver, which delivers fixes and raw measurements and accepts assistance data to start faster.",
    d: "The platform talks to the receiver through a stable hardware interface: start and stop, set interval, and receive position, satellite status and optional raw pseudoranges. Assistance data such as satellite orbits and approximate time and position is downloaded and injected to cut the time to the first fix from minutes to seconds. The receiver may run on a separate low-power processor. It is hard because performance varies by chip and antenna, and because time injection errors can corrupt fixes.",
    k: ["Assisted startup with downloaded data vs standalone cold start: assistance gives a fast first fix at the cost of traffic and privacy; standalone works anywhere but takes much longer.", "Expose raw measurements to apps vs hide them: raw data enables precise positioning by advanced apps; it needs a permission because it can reveal more than a position."],
    p: ["Poor antenna placement or a metal case in a design makes fixes drift despite correct software.", "Stale assistance data makes the first fix slower than none at all."],
    v: "Cold start the receiver outdoors with and without assistance and record time to first fix: assisted should be several times faster, and reported positions should settle within the specified accuracy.",
    dep: ["hal-contracts", "data-connection-manager"]
  },
  "geofencing": {
    s: "Low-power monitoring that notifies an app when the device enters or leaves a circular area, without the app running continuously.",
    d: "An app registers a center, radius and transitions. The location stack stores the fences and checks them using low-power signals: coarse network position, motion detection and occasional satellite fixes only when the device is near an edge. On transition it wakes the app with a short window. The system limits how many fences an app may hold. It is hard because the result is probabilistic, accuracy in cities is poor, and the trade between latency and battery depends on how close the device is to a boundary.",
    k: ["System-managed fences vs app polling: system monitoring is far cheaper and survives app death; there is no guarantee of timely transitions, especially in dense areas.", "Small radius for precision vs large radius for reliability: small radii are sensitive to location error and may never trigger; large radii fire early."],
    p: ["A radius under about a hundred meters often fails to trigger indoors or in poor signal.", "Fences are cleared on reboot or location setting change unless the app registers them again."],
    v: "Register a fence at a known place and walk across its edge at walking speed with the app killed: confirm the transition wakes the app within the stated delay, and confirm fences are re-registered after a reboot.",
    dep: ["location-fusion", "job-scheduler", "sensor-hub"]
  },
  "call-manager": {
    s: "The service that tracks every voice and video call across carriers and apps, decides which is active, and handles audio, emergency calls and the in-call user interface.",
    d: "Calls come from the radio interface or from apps that register as call providers. The manager holds the state of each call, such as dialing, active and held, and arbitrates between them. It starts the in-call screen, routes audio through the audio policy, and applies blocking and screening. Emergency calls bypass all restrictions including SIM and lock state and select a network even without service. The hard parts are the state machine across providers, handover between networks, and always working for emergencies.",
    k: ["One manager for carrier and app calls vs separate stacks: one manager gives a single hold, merge and UI behavior; app providers must conform to its model.", "Emergency calls through the normal path vs a dedicated path: a normal path reuses mature code; a dedicated path stays functional when other services fail or policies block them."],
    p: ["A call arriving while another app holds audio focus produces no ring or the wrong audio route.", "Emergency calling blocked by a device-management restriction or missing SIM is a safety failure."],
    v: "Place a call, receive a second one, hold and swap between them, then place an emergency call with no SIM and with the screen locked: confirm each state transition and that the emergency call connects.",
    dep: ["radio-interface-layer", "audio-policy-routing", "sim-subscription-manager", "lock-screen"]
  },
  "radio-interface-layer": {
    s: "The vendor-implemented bridge between the platform's telephony services and the baseband processor, carrying commands for calls, messages, registration and signal state.",
    d: "The baseband runs its own firmware and real-time operating system, handling the cellular protocol stack. The platform sends requests over a defined interface, such as dial, send message, or select network, and receives unsolicited events, such as signal change and incoming call. Every request is asynchronous and may fail in a carrier-specific way. It is hard because the baseband is a closed, high-privilege component with a large attack surface, and because each vendor's behavior and carrier configuration differs.",
    k: ["Versioned standard interface vs vendor-specific commands: a standard interface lets the platform upgrade independently; vendor extensions reach features the standard omits and tie behavior to one chip.", "Isolate the baseband from main memory vs shared access: isolation limits damage from a baseband compromise; direct memory access eases high-speed data but widens the exposure."],
    p: ["A baseband crash drops all calls and data and must be recovered by restarting the radio without losing subscription state.", "Carrier-specific quirks in unsolicited events appear only on that network and are missed in lab testing."],
    v: "Force a baseband restart on a test device with an active data session and confirm the platform detects it, re-registers on the network and restores data within the documented time.",
    dep: ["hal-contracts", "transactional-ipc"]
  },
  "sim-subscription-manager": {
    s: "Tracks installed and embedded subscriber identity modules, which number or plan is used for calls, messages and data, and applies carrier-specific settings and privileges.",
    d: "When a SIM or embedded profile is detected, the manager reads its identity, looks up the carrier, and loads that carrier's configuration: network names, messaging gateway, tethering rules and feature flags. With more than one subscription, it stores user choices for default voice, messaging and data. Carrier privileges let a carrier's app manage the subscription without being a system app. It is hard because identities are sensitive, profiles can be downloaded or swapped, and misconfiguration silently breaks calls or data.",
    k: ["Embedded profiles downloadable over the air vs a physical card: downloading is convenient and allows remote switching; it concentrates risk in the profile download flow and the provisioning service.", "Carrier-privileged apps vs system-only control: privileges let carriers ship features without vendor deals; they widen the set of apps with sensitive control and need strict signature checks."],
    p: ["Cloning or swapping a number through a weak recovery flow lets an attacker receive verification codes.", "Wrong carrier configuration after a SIM swap leaves messaging or data broken until manual reset."],
    v: "Insert a second subscription and set separate defaults for calls and data; confirm each service uses the chosen one, and swap SIMs and verify carrier settings reload.",
    dep: ["radio-interface-layer", "keystore-service"]
  },
  "data-connection-manager": {
    s: "Chooses and maintains the network used for data, setting up cellular bearers, selecting between Wi-Fi and mobile, and applying per-app network rules and metering.",
    d: "The manager sets up cellular data sessions with the right access point and tracks several connections for different purposes, such as internet and messaging. It scores available networks, such as Wi-Fi and cellular, validates that each really reaches the internet, and picks the default, with per-app and per-use overrides. It exposes whether a link is metered so apps and the scheduler can defer large transfers. Hard parts are handover without breaking connections, captive portals, and apps that need a specific network.",
    k: ["Validate connectivity before preferring a network vs trust link state: validation avoids switching to a Wi-Fi that has no internet; it adds probes that are visible on the network.", "Seamless handover vs hold the current link until it fails: handover keeps calls and transfers alive; it can flap between marginal networks and burn battery."],
    p: ["Captive portals that block probes leave the device on a connected-but-unusable Wi-Fi and stall apps.", "Apps that bind to one network lose connectivity when it drops while another is available."],
    v: "Connect to a Wi-Fi network with no internet and confirm the manager keeps cellular as default and flags the Wi-Fi as unvalidated; restore internet and confirm it switches without dropping an ongoing download.",
    dep: ["radio-interface-layer", "connectivity-stack"]
  },
  "connectivity-stack": {
    s: "The Wi-Fi, Bluetooth and other short-range radio services: scanning, joining, pairing, profiles and background scanning, built over vendor controller firmware.",
    d: "The Wi-Fi service handles saved networks, scanning, authentication and roaming, while the Bluetooth service manages pairing, profiles for audio, input and low-energy peripherals, and per-device connection state. Both live in system processes above controller firmware reached through hardware interfaces. Scan results can reveal location, so they are permission-gated. It is hard because the radios share spectrum, vary widely between vendors and access points, and failures of pairing and roaming are the most common user complaints.",
    k: ["Platform-managed network selection vs app-driven joins: platform selection gives smooth roaming and protects saved credentials; apps that must join a specific device need a controlled suggestion flow.", "Always-on background scanning vs only on demand: background scanning speeds location and connection; it costs power and leaks nearby device presence."],
    p: ["Bluetooth devices that need a profile the platform version lacks pair successfully but do nothing.", "Scan results accessible without a location grant leak the user's whereabouts through nearby network names."],
    v: "Pair a headset and a peripheral, roam between two access points with the same name while streaming, and confirm audio continues without a dropout beyond the stated limit; deny location permission and confirm scan results are withheld.",
    dep: ["hal-contracts", "permission-state-store"]
  },
});
