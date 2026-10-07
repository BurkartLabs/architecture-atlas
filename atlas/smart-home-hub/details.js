// Details for the smart home hub plate, part 1: user interfaces, voice, accounts.
ATLAS.details("smart-home-hub", {
  "companion-app": {
    s: "The phone application residents use to see device state, send commands, edit rules and receive alerts, at home over the local network and away through the cloud relay.",
    d: "The app talks to the hub's command and state interfaces, preferring a direct local connection found by discovery and falling back to the remote access path. It caches the device list so screens open instantly, subscribes to state changes over a persistent connection, and sends commands with an identifier so retries are not applied twice. It is hard because phones sleep, switch networks and background the app, so the client must reconcile cached state with the truth whenever it wakes.",
    k: ["Local-first connection with cloud fallback vs always through the cloud: local is faster and works offline, but the app must detect which path is live and switch without confusing the user.", "Optimistic UI update vs waiting for confirmation: the switch feels instant, but a failed command briefly shows a state that never existed."],
    p: ["A cached state shown as current makes a resident believe a door is locked when the hub lost contact with it an hour ago.", "A retried command without an identifier turns a lost acknowledgment into a double action, such as toggling a light twice."],
    v: "Turn on a lamp from the app on the home network with the router's internet link unplugged and confirm the lamp lights within about a second and the app shows the confirmed state.",
    dep: ["state-event-bus","user-accounts","remote-access-proxy"]
  },
  "wall-panel-dashboard": {
    s: "A fixed touchscreen or tablet showing room controls and status for everyone in the house, usable without logging in and without a phone.",
    d: "The panel renders the same entities and scenes as the app but with a larger, glanceable layout configured per room. It runs a kiosk client signed in as a restricted device account, so it can control lights and climate but not edit rules or reveal credentials. It stays on a low-power display schedule, wakes on presence, and survives hub restarts by reconnecting and resyncing. It is hard because it is always on, so memory leaks, burn-in and stale data show up over weeks, not minutes.",
    k: ["Restricted device account vs full user session: a wall panel in a hallway cannot expose the whole house, but sensitive actions need a separate confirmation step.", "Live subscription vs periodic polling: subscriptions are responsive, but a silently dropped connection leaves frozen values unless a heartbeat detects it."],
    p: ["A panel that keeps its last values after losing the hub connection looks healthy while showing outdated state.", "Always-on animation and full brightness shorten the display's life and heat the enclosure."],
    v: "Restart the hub while the panel is showing a room and confirm the panel marks itself disconnected within a few seconds, then reconnects and shows current values without being touched.",
    dep: ["state-event-bus","household-roles","areas-and-rooms"]
  },
  "local-web-ui": {
    s: "A browser interface served by the hub itself, used for first setup, advanced configuration and recovery when the app or cloud is unavailable.",
    d: "The hub serves a web application over its local certificate and exposes the same interfaces the app uses, plus administration pages: network settings, logs, backups and device diagnostics. It must be reachable by a stable local name and work when no internet exists, so all assets are bundled rather than loaded from the outside. It is hard because it is the recovery surface: it has to remain usable even when other services are crashed, which argues for a small separate process.",
    k: ["Bundled assets vs externally hosted front end: bundling works offline and avoids third-party exposure, but makes the hub image larger and ties UI updates to hub updates.", "Separate admin process vs part of the main server: a separate process still answers when the main one is wedged, but duplicates authentication code."],
    p: ["Loading fonts or scripts from the internet makes the setup page blank during an outage, exactly when it is needed.", "Serving administration on the same open port as device traffic exposes it to every device on the network."],
    v: "Disconnect the hub from the internet, kill the automation process, and confirm the local page still loads over its certificate and shows the failed service with a restart control.",
    dep: ["local-tls-certificates","process-supervisor","user-accounts"]
  },
  "notifications": {
    s: "Messages sent to residents when something needs attention, such as a door left open or a water leak, with delivery rules to avoid spam and missed alerts.",
    d: "Automation actions, device faults and security events raise notifications with a severity, a target audience and optional action buttons. The service applies rate limits, quiet hours and grouping, then delivers through the push gateway, the panel or a local speaker, falling back to other channels if acknowledgment does not arrive. It is hard because the useful alert and the annoying one look similar: too many teach residents to ignore all of them, and a critical alert must still break through quiet hours.",
    k: ["Severity-based routing vs one channel for everything: critical alerts can use loud channels and bypass quiet hours, but the severity must be assigned carefully by each rule author.", "Grouping repeated alerts vs sending each one: grouping reduces noise, but delays the first alert if the grouping window is waited out."],
    p: ["A flapping sensor that triggers a notification each time floods residents and gets the whole app muted.", "A critical alert sent only through the cloud path never arrives when the internet is down."],
    v: "Trigger a simulated leak sensor during quiet hours with the internet disconnected and confirm a local alert sounds and the notification is queued and delivered once the connection returns.",
    dep: ["push-gateway","household-roles","state-event-bus"]
  },
  "event-history-timeline": {
    s: "A searchable record of what happened in the home and who or what caused it, such as a light switched on by a rule or by a person.",
    d: "The timeline merges state changes, commands, rule runs and security events, each tagged with its origin: a user, a rule, a scene, a voice command or a physical switch. It reads from the history recorder and the audit log and renders them in time order with filters by device, room and actor. It is hard because causes are chains: a motion sensor fired a rule that ran a scene that set eight lights, and the context identifier must follow the chain so the user sees one cause, not eight events.",
    k: ["Context identifiers carried through every command vs inferring cause from timing: explicit context is accurate, but every layer must propagate it or the chain breaks.", "Merged timeline vs separate logs per subsystem: one view answers why the light came on, but needs a common event shape across subsystems."],
    p: ["Events recorded without their origin leave residents unable to tell a person's action from a rule misfire.", "An unbounded timeline query over a year of data stalls the hub's database."],
    v: "Trigger a rule that sets a scene and confirm the timeline shows the sensor event, the rule run and each device change linked under one cause, with a person's manual change shown separately.",
    dep: ["history-recorder","access-audit-log","state-event-bus"]
  },
  "hub-status-indicators": {
    s: "The lights, sounds and status pages that tell a person whether the hub is starting, healthy, offline, pairing or in need of attention, without opening an app.",
    d: "The hub maps internal states, such as booting, no network, pairing mode, update in progress or radio fault, onto a small set of LED patterns and tones, and mirrors them on a status page with the underlying reason. The indicator process runs independently of the main application so that a crash still produces a visible signal. It is hard because a handful of patterns must unambiguously cover many states, and the physical reset and pairing buttons must be safe against accidental holds.",
    k: ["Few distinct patterns vs one per state: a small vocabulary is memorable, but forces a status page for the detail, which needs a working network to open.", "Hardware-driven indicator vs application-driven: hardware control shows a crash, but cannot easily reflect application-level problems."],
    p: ["A steady green light shown while the radio coprocessor is dead gives owners false confidence.", "A reset button that factory-resets on a long press without any warning erases a home's pairings by accident."],
    v: "Kill the main application process and confirm the indicator changes to its fault pattern within the supervisor's detection time, then returns to normal after automatic restart.",
    dep: ["process-supervisor","pairing-mode-control","watchdog-recovery"]
  },

  "wake-word-detection": {
    s: "A small always-listening model on the hub or a satellite microphone that recognizes a trigger phrase and only then starts capturing and forwarding speech.",
    d: "Audio from the microphone passes through noise suppression and echo cancellation into a compact neural model that scores each short window for the wake phrase. Only after a detection does the pipeline open a recording and start streaming audio onward. Running locally means nothing leaves the house before the trigger. It is hard because the model must be cheap enough to run continuously, tolerate a television in the room, and balance false accepts that record private talk against false rejects that make the assistant seem deaf.",
    k: ["On-device detection vs cloud detection: on-device keeps idle audio inside the house, but limits model size and accuracy on small hardware.", "Low threshold vs high threshold: a low threshold feels responsive but triggers on television dialogue; a high one forces repeated attempts."],
    p: ["A false accept sends private conversation to recognition and may store it, which residents never agreed to.", "No echo cancellation lets the assistant's own speech trigger it, producing endless loops."],
    v: "Play ten minutes of recorded television dialogue next to the microphone and count activations, then speak the phrase from five meters and confirm detection, with a log showing no audio forwarded before detection.",
    dep: ["voice-privacy-controls","process-supervisor"]
  },
  "speech-to-text": {
    s: "Converts the captured utterance into text, either with a model running on the hub or by streaming audio to a recognition service.",
    d: "After the wake word, audio is streamed to a recognizer that produces partial and final transcripts. A local model keeps audio in the house but needs memory and processor time that a small hub may lack, so many designs offload to a stronger machine on the network or to a cloud service. Vocabulary biasing with the home's own device and room names improves accuracy. It is hard because accuracy varies with accents and noise, and latency adds directly to how long residents wait for the light.",
    k: ["Local recognition vs cloud recognition: local protects privacy and works offline, but accuracy and speed depend on hardware; cloud is accurate but sends speech out.", "Streaming partial results vs waiting for the end: streaming starts intent work sooner, but may act on a transcript that later changes."],
    p: ["Recognition that mishears a similar device name, such as bedroom and bathroom, operates the wrong device.", "Falling back to cloud recognition silently when local fails breaks a privacy promise made to residents."],
    v: "Say a list of fifty home commands, including similar room names, with the router unplugged and confirm the transcripts and word error rate are within the target and the response time stays under the stated limit.",
    dep: ["wake-word-detection","voice-privacy-controls"]
  },
  "intent-parsing": {
    s: "Maps recognized text to a structured request such as set brightness of a named light, using templates or a language model, and slots for names, numbers and rooms.",
    d: "The parser matches sentences against intent templates or a trained classifier, then extracts slots: the target, the value, the room or the time. It consults the device and area names so only real entities fill slots, and it can ask a follow-up question when something is missing. Responses are built in the same step, so confirmation text matches what was done. It is hard because natural language is ambiguous and a wrong guess performs a real action, so the parser should prefer a clarifying question over a risky guess.",
    k: ["Rule templates vs learned language model: templates are predictable, fast and run on small hardware, but cover fewer phrasings; models are flexible but can invent actions.", "Asking a clarifying question vs guessing: questions avoid wrong actions, but slow down every ambiguous command."],
    p: ["A model that maps an unfamiliar sentence to unlock the door performs a security-relevant action from a mishearing.", "Templates that hard-code English phrasing leave other household languages unsupported."],
    v: "Issue paraphrases of twenty commands and confirm each yields the intended structured request, and that a sentence naming a nonexistent device returns an apology and no command.",
    dep: ["speech-to-text","name-resolution","capability-schema"]
  },
  "name-resolution": {
    s: "Resolves the words a person used, such as the lamp or the kitchen, to specific entities, using names, aliases, rooms and the context of where the speaker is.",
    d: "The resolver builds an index of entity names, aliases and areas, normalizes case and plurals, and ranks candidates. It uses context: a request made from a kitchen satellite and naming only the lights means the lights in that room. Only entities explicitly exposed to voice are considered, which keeps locks and alarms out of reach unless chosen. It is hard because names collide, change and carry household in-jokes, and a good resolution depends on the room of the speaker, which many microphones cannot report reliably.",
    k: ["Context from the speaking device's room vs requiring full names: context makes speech natural, but acts on the wrong room if the satellite is misassigned.", "Exposure by opt-in vs by default: opt-in keeps sensitive devices out of voice reach, but residents must curate the list."],
    p: ["Two devices with the same alias make the resolver pick one arbitrarily, so the command never does what was meant.", "Renaming a device without updating aliases breaks habits and voice routines silently."],
    v: "Say turn off the lights from satellites in two different rooms and confirm only that room's lights change, then try a command naming a non-exposed lock and confirm it is refused.",
    dep: ["device-registry","areas-and-rooms","entity-model"]
  },
  "text-to-speech": {
    s: "Generates spoken replies and announcements and plays them on the speaker nearest the person, using a local voice or a cloud voice.",
    d: "The synthesizer turns reply text into audio, which is sent to a chosen output speaker. Short, repeated phrases can be cached to cut latency. Announcements from automations, such as the washing machine finishing, use the same path and must be routed to the right room and respect do-not-disturb. It is hard because synthesis time adds to every reply, speakers differ in format and network delay, and multiple speakers playing the same line must be kept in sync to avoid an echo.",
    k: ["Local voice vs cloud voice: local works offline and keeps text private, but sounds more mechanical; cloud sounds natural but needs the internet.", "Caching common phrases vs synthesizing each time: caching is faster, but stale phrases may persist after a language or voice change."],
    p: ["Announcements played at full volume at night wake a sleeping household.", "Synthesizing with no timeout lets a slow cloud service hold a reply for many seconds."],
    v: "Trigger a washer-finished announcement during do-not-disturb and confirm it is held, then at a normal hour confirm it plays only on the speaker in the target room within the time limit.",
    dep: ["intent-parsing","notifications"]
  },
  "voice-privacy-controls": {
    s: "The settings and physical controls that decide what audio is recorded, where it is processed, how long transcripts are kept and whether microphones are on at all.",
    d: "A hardware mute switch cuts the microphone circuit, and a software setting selects local-only or cloud processing, whether to keep recordings for tuning and the retention period. The hub shows when audio is being captured with a visible light, and exposes a log of voice interactions that the owner can review or delete. It is hard because the guarantees must be real, not cosmetic: the mute control must disable capture below the software, and data removal must reach backups and cloud copies.",
    k: ["Hardware mute vs software mute: hardware cannot be bypassed by a bug, but costs a switch and cannot be controlled remotely.", "Retaining samples to improve recognition vs deleting at once: retention improves accuracy for the household, but stores sensitive speech."],
    p: ["A mute that only stops forwarding while the microphone still records locally breaks the promise the light implies.", "Deleting a transcript from the interface while a copy persists in backups leaves it recoverable."],
    v: "Press the hardware mute, speak the wake phrase, and confirm the microphone input is silent at the driver level and the indicator shows muted; then delete history and confirm it is absent from a fresh backup.",
    dep: ["data-minimization","hub-status-indicators"]
  },
  "assistant-bridge": {
    s: "Exposes the hub's devices to a third-party voice assistant and routes its commands back, usually through a cloud link or a local protocol the assistant supports.",
    d: "The bridge publishes a filtered list of entities and their capabilities to the assistant's cloud or local interface, receives directive messages, and translates them into hub commands, then reports state back so the assistant's app stays current. Account linking ties the assistant user to a hub account through an authorization flow. It is hard because the assistant defines its own device types and limits, so mappings are lossy, and every command crossing the cloud adds latency and a dependency that the local-first design wanted to avoid.",
    k: ["Cloud bridge vs local execution path: cloud bridges are simple and work with any assistant, but add delay and fail offline; local paths work offline but need assistant support.", "Exposing everything vs an allow list: everything is convenient, but hands locks and alarms to a third party's account security."],
    p: ["A mapping that treats a garage door as a switch lets any voice command open it with no confirmation.", "Linking tokens never rotated remain valid after the resident removes the assistant, leaving a standing access path."],
    v: "Link a test assistant account, expose one light and one lock, issue a light command and confirm state sync in both apps, and confirm the lock command requires the configured confirmation or is refused.",
    dep: ["entity-model","token-management","cloud-account-link","permission-enforcement"]
  },

  "user-accounts": {
    s: "The identities that can sign in to the hub, with credentials, sessions and per-person preferences, stored locally and optionally linked to a cloud identity.",
    d: "Each person has a local account with a salted password hash, optional second factor and device-bound sessions. A linked cloud identity allows remote sign-in without exposing the local credentials. Sessions are tokens with expiry and a revocation list. The hub must support account recovery that does not rely on the internet, such as a physical-access reset. It is hard because a home has no administrator on call: recovery has to be safe against a stranger yet usable by a forgetful owner.",
    k: ["Local accounts with optional cloud link vs cloud-only identity: local accounts work offline and survive vendor shutdown, but the hub must handle recovery and password storage itself.", "Short sessions vs long-lived sessions: short ones limit stolen phone damage, but annoy residents on devices that are used daily."],
    p: ["A reset that works over the network for anyone who knows the owner's email lets an attacker take over the home.", "Sessions that never expire leave a lost phone able to unlock the front door."],
    v: "Sign in on two phones, revoke one from the account page, and confirm its next request is rejected within seconds while the other continues; then perform the physical reset path and confirm it needs button access.",
    dep: ["embedded-database","token-management","local-tls-certificates"]
  },
  "household-roles": {
    s: "A set of roles such as owner, adult, child and guest that bundle permissions, so rights are granted by role and by area rather than one device at a time.",
    d: "Each account holds a role that maps to permissions: view, control, edit automations, manage devices, manage users. Rules can be scoped by area, such as children controlling their own room only, or by device class, such as locks restricted to adults. The permission enforcement layer consults the role on every command, regardless of which interface it arrived through. It is hard because roles must stay simple enough to understand while covering real families, such as a teenager who may use lights but not the thermostat schedule.",
    k: ["Coarse roles vs per-device permissions: roles are easy to explain and audit, but real homes always need a few exceptions.", "Role checked at the hub vs only in the app: hub enforcement stops other clients and scripts, but needs every interface to pass identity along."],
    p: ["Enforcing roles only in the app lets a script or the voice path bypass them.", "Giving the first user owner rights forever leaves the home unmanageable when that person moves out."],
    v: "Sign in as a child account and try to unlock the front door through the app, voice and the local web interface and confirm all three are refused and each denial is logged.",
    dep: ["user-accounts","areas-and-rooms","permission-enforcement"]
  },
  "guest-access": {
    s: "Time-limited, restricted access for visitors, cleaners and rental guests, such as a door code that works only on certain days or a temporary control link.",
    d: "A guest grant names what the visitor can do, such as unlock one door or adjust one room, and when: a start, an end and optional weekdays. It issues either a lock code programmed into the lock or a token that the guest uses through a web page, with no account needed. Expiry is enforced by the hub and also pushed to devices that store codes internally. It is hard because a code stored in a lock is outside the hub's control, so revocation depends on the lock being reachable.",
    k: ["Code stored in the device vs hub-validated token: device codes work when the hub is down, but cannot be revoked if the lock is offline.", "Account-less link vs requiring a guest account: links are easy for visitors, but can be forwarded to others."],
    p: ["An expired guest code left active in an offline lock keeps working after the hub shows it revoked.", "Guest links with no usage limit let a visitor share the door with strangers."],
    v: "Create a one-day door code, confirm it opens the lock inside the window and not outside it, then revoke it while the lock is offline and confirm the hub shows the revocation as pending until the lock returns.",
    dep: ["household-roles","token-management","access-audit-log"]
  },
  "invitations-and-sharing": {
    s: "The flow by which an owner adds another person or another home to the hub, with explicit scope and a way to accept, limit or withdraw the share.",
    d: "An invitation carries an expiry, a role and optionally selected areas or devices, and is accepted by scanning a code or following a link while authenticated. Accepting creates or links an account and records the grant. Sharing a device with another ecosystem uses the multi-admin mechanism so a second controller gets its own credentials. It is hard because invitations travel through insecure channels such as messaging apps, so they must be single-use and short-lived, and the owner must see clearly what each person can reach.",
    k: ["Single-use short-lived invitation vs permanent invitation link: single-use limits interception damage, but forces resending when someone is slow to accept.", "Owner approval of every share vs self-service: approval keeps control, but burdens households that change often."],
    p: ["Invitation codes that can be redeemed more than once end up in group chats and admit unknown people.", "Sharing screens that list people but not their reach hide a stale invitee who still controls the locks."],
    v: "Send an invitation, accept it once, then try to redeem the same code again and confirm it fails; confirm the new person sees only the granted areas and the owner can see and revoke the grant.",
    dep: ["user-accounts","household-roles","multi-admin-sharing"]
  },
  "presence-detection": {
    s: "Estimates who is home from phone connections, location, motion and door events, feeding automations such as arriving and leaving modes.",
    d: "Several weak signals are combined: a phone appearing on the local network or via Bluetooth, optional geofence events from the app, and motion or door activity. A per-person state of home or away is kept with hysteresis so brief dropouts do not flip it. Automations use home, away and arriving rather than raw signals. It is hard because each signal is unreliable: phones sleep off the network, location needs permission and battery, and a lone sleeping person produces no motion.",
    k: ["Network presence vs geofence vs motion: network presence is private and local, geofencing sees arrival early but depends on location permission, and motion cannot identify people.", "Long away delay vs short: a long delay avoids false away at the cost of leaving heating on after everyone leaves."],
    p: ["A phone that drops off Wi-Fi to save battery marks the person away and locks or arms the house around them.", "Location history stored in the cloud turns a convenience feature into a record of where people go."],
    v: "Leave the house with one phone and confirm the person switches to away after the delay and an away rule runs once, then return and confirm home is set and no flapping occurs over a ten-minute walk around the property.",
    dep: ["user-accounts","state-store","data-minimization"]
  },
  "access-audit-log": {
    s: "An append-only record of sensitive actions and security events: who signed in, who unlocked what, which grants changed, and every failed attempt.",
    d: "Security-relevant operations write a record with actor, action, target, origin interface and result into a separate store from ordinary history, with a longer retention and tamper evidence such as chained hashes or export to another system. The owner can review it, and alerts can fire on patterns like repeated failed sign-ins. It is hard because logs hold personal information about who was home and when, so access to the log is itself sensitive, and storage on flash must be bounded without dropping the evidence that matters.",
    k: ["Separate audit store vs sharing the history database: separation keeps evidence safe from routine pruning, but adds another store to run and back up.", "Hash-chained entries vs plain rows: chaining shows tampering, but cannot prevent deletion of the tail by someone with disk access."],
    p: ["A rotated log that discards the oldest entries erases the very incident the owner is investigating.", "Logging full tokens or door codes into the audit trail turns the trail into a credential leak."],
    v: "Unlock a door by code, fail three sign-ins, and change a role, then read the audit log and confirm each event appears with actor, origin and result, and that editing a stored row breaks the chain check.",
    dep: ["embedded-database","user-accounts","clock-sync"]
  },
});
