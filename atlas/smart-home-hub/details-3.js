// Details for the smart home hub plate, part 3: cloud, commissioning, firmware.
ATLAS.details("smart-home-hub", {
  "cloud-account-link": {
    s: "The association between a hub and an account in the vendor's cloud, established by a claim flow and proven with credentials the hub stores.",
    d: "On first connection the hub presents a device identity provisioned at manufacture, and the owner proves possession through a code shown on the device or a button press. The cloud then issues a credential that the hub uses to authenticate its outbound connections. Unlinking and ownership transfer revoke it. It is hard because the claim window is an attack surface: anyone who claims an unclaimed hub first owns it, and a sold hub must be cleanly released from the previous owner.",
    k: ["Claim by physical proof vs by serial number: physical proof stops remote hijacking, but adds a setup step; serial numbers are guessable and weak.", "Hub-initiated outbound link vs inbound access: outbound works behind any router with no open ports, but depends on the cloud endpoint staying up."],
    p: ["A hub resold without releasing the old claim stays controllable by the previous owner.", "Cloud credentials stored in plain text on flash are readable by anyone who obtains the unit."],
    v: "Claim a new hub with the physical confirmation, confirm remote access works, release it from the account, and confirm the old credential is rejected by the cloud and a fresh claim is required.",
    dep: ["token-management","device-key-store","user-accounts"]
  },
  "relay-tunnel": {
    s: "A persistent outbound connection from the hub to a cloud relay that carries remote requests inward, so the hub needs no open ports or fixed address.",
    d: "The hub keeps a multiplexed encrypted connection to a relay, reconnecting with backoff and keepalives tuned for home routers that drop idle sessions. Remote clients connect to the relay, which forwards their requests down the tunnel after authentication. Streams carry commands, state subscriptions and video. It is hard because home networks change under it: addresses rotate, routers drop mappings, and thousands of hubs reconnecting after a relay outage create a thundering herd.",
    k: ["Outbound tunnel vs port forwarding: tunnels work behind carrier-grade address translation and avoid exposure, but make the relay a trusted intermediary of traffic.", "End-to-end encryption through the relay vs terminating at the relay: end-to-end hides content from the vendor, but prevents the relay from helping with caching or push."],
    p: ["Reconnect attempts without jittered backoff after an outage overload the relay and extend the outage.", "Keepalive intervals longer than the router's idle timer silently kill the tunnel while the hub shows connected."],
    v: "Block the hub's internet for ten minutes, restore it, and confirm the tunnel is re-established within the target time with jittered retries, and a remote request then reaches the hub.",
    dep: ["cloud-account-link","local-tls-certificates","network-segmentation"]
  },
  "remote-access-proxy": {
    s: "The service layer that authenticates a remote client, then forwards allowed requests to the hub through the tunnel, enforcing the same permissions as local access.",
    d: "A remote request arrives at the cloud edge with the user's session. The proxy verifies the session, checks that the user is a member of the target home, and forwards only approved operations, never raw administration. Rate limits and anomaly detection apply, and the hub still enforces its own permissions on arrival. It is hard because remote access widens the attack surface to the whole internet, and the proxy must not become a path that skips the hub's role checks.",
    k: ["Hub enforces permissions again vs trusting the proxy: double enforcement survives a proxy bug, but costs duplicated logic and sync of roles.", "Whitelist of remote operations vs full parity with local: a whitelist limits damage from a stolen session, but some remote features need wider reach."],
    p: ["A proxy that passes administration calls through lets a stolen phone session reconfigure the hub.", "Cloud and hub disagreeing about the user's role leaves a revoked person with remote access."],
    v: "Remove a user's membership, then attempt a remote command with their still-valid session and confirm both proxy and hub deny it, and that the attempt appears in the audit log.",
    dep: ["relay-tunnel","permission-enforcement","user-accounts"]
  },
  "cloud-sync": {
    s: "Replicates selected hub data, such as device names, rules and settings, to the cloud so that apps, a replacement hub and other homes can use it, with conflict handling.",
    d: "Changes on the hub or from a remote app are recorded as versioned operations and exchanged through the cloud, which stores a copy. Syncing is selective: configuration and metadata go up, while sensitive data and bulky history stay local unless enabled. Conflicts from concurrent edits resolve by timestamp, by field or by asking. It is hard because the hub is authoritative for the physical world yet edits may arrive from anywhere, and sync should work after days offline.",
    k: ["Last writer wins vs field-level merge: last writer wins is simple, but loses a concurrent edit; field merge preserves more, but needs structured data.", "Syncing configuration only vs also history: configuration-only is small and private, but a replacement hub starts with no past data."],
    p: ["Syncing local-only secrets to the cloud for convenience breaks the privacy promise made in the settings page.", "An old hub restored from backup and syncing overwrites newer cloud configuration."],
    v: "Edit a room name on the hub offline and in the app at the same time, restore connectivity, and confirm both devices converge to the documented merge result and nothing is lost silently.",
    dep: ["embedded-database","cloud-account-link","data-minimization"]
  },
  "cloud-to-cloud-integrations": {
    s: "Links to other vendors' services through their cloud interfaces, to control devices that have no local interface or to publish the hub's state to partners.",
    d: "The hub or the cloud holds an authorization for another vendor's account and calls its interface to read state and send commands, or receives events through webhooks. Entities from these sources appear in the device model with a cloud-sourced label. Polling intervals and quotas shape freshness. It is hard because these devices are outside the local-first guarantee: they stop working when either cloud is down, vendors change interfaces without notice, and rate limits make fast automation impractical.",
    k: ["Webhook push vs polling: push gives timely events, but needs a reachable endpoint; polling is simple, but slow and quota-hungry.", "Surface cloud devices like local ones vs marking them distinct: uniform surfaces are convenient, but hide that rules involving them can fail offline."],
    p: ["A rule depending on a cloud-only device runs unreliably during an outage and nobody knows why.", "Revoked or expired third-party authorizations silently turn the devices unavailable."],
    v: "Link a cloud-only thermostat, confirm its entity shows state within the polling interval, cut the cloud link, and confirm the entity is marked cloud-unavailable and dependent rules report the cause.",
    dep: ["cloud-account-link","entity-model","token-management"]
  },
  "offline-fallback": {
    s: "The defined behavior when the internet or cloud is unavailable: which features continue locally, which degrade, and how the system tells residents and recovers.",
    d: "The hub detects loss of connectivity by probing and by failed requests, and moves cloud-dependent features into degraded states: remote access queues, voice falls back to local recognition if available, notifications use local channels. Core features, meaning device control, rules, schedules and local interfaces, are designed to never need the cloud. On return it reconciles queued data and refreshes tokens. It is hard because partial failure is more common than total: slow links and captive portals look online but fail.",
    k: ["Probe-based detection vs relying on request errors: probes detect partial failure early, but add traffic and false alarms on flaky links.", "Queue cloud-bound actions vs drop them: queuing preserves intent, but replaying an old unlock request later is dangerous."],
    p: ["Replaying a queued remote command hours after it was issued performs an action nobody wants anymore.", "A hub that blocks startup waiting for the cloud fails to arm security after a power cut during an outage."],
    v: "Unplug the router and then run the checklist of core features: lights, rules, schedules, local app, local voice and alarm, confirming each works, and confirm degraded features say why in the status page.",
    dep: ["state-store","trigger-engine","notifications","cloud-account-link"]
  },
  "push-gateway": {
    s: "Delivers notifications to phones through the mobile platforms' push services, since the hub cannot reach sleeping phones directly.",
    d: "The app registers a push token with the hub or cloud, and the gateway sends alerts through the platform's push service with priority and expiry. Payloads should carry minimal content, with the app fetching details securely after waking. Tokens expire and rotate, and the gateway removes stale ones. It is hard because push is best effort, delivery is subject to the platform's power saving, and sending detailed text about the home through a third-party service leaks private information.",
    k: ["Minimal payload with later fetch vs full text in the push: minimal protects privacy and avoids stale content, but needs a network round trip to display.", "High-priority delivery vs normal: high priority breaks through power saving for alarms, but abused for routine alerts wastes battery and may be throttled."],
    p: ["Messages such as front door unlocked by name sent in clear through the push service expose household habits.", "Dead tokens never pruned make the gateway waste effort and report false success."],
    v: "Send a critical alert to a phone in battery saver mode and confirm arrival within the target time, with the lock screen showing generic text and the details loaded only after authentication.",
    dep: ["cloud-account-link","data-minimization","notifications"]
  },
  "backup-and-restore": {
    s: "Captures the hub's configuration, device identities and keys into an encrypted archive that can restore the home onto the same or a replacement hub.",
    d: "A backup includes the registry, rules, accounts, area layout and credentials needed to control paired devices, such as network keys. It is encrypted with a key the owner holds, and stored locally, on a network share or in the cloud. Restore must rebuild the radio network so devices continue to obey the new hub without being paired again. It is hard because device credentials live partly in the radio coprocessor, and a backup that omits them forces re-pairing every device.",
    k: ["Include radio network keys vs exclude them: including keys allows seamless replacement, but makes the archive highly sensitive; excluding forces re-pairing.", "Cloud backup vs local only: cloud survives loss of the house and hub, but adds exposure and depends on the owner's key custody."],
    p: ["Backups never test-restored turn out to miss the radio keys, discovered only when the hub dies.", "An unencrypted archive left on a network share exposes every credential in the home."],
    v: "Back up a hub, restore onto a fresh unit, and confirm all devices respond to commands without re-pairing, rules and names are intact, and the restored hub reports the backup's date.",
    dep: ["embedded-database","device-key-store","radio-coprocessor","mesh-network-manager"]
  },

  "local-discovery": {
    s: "Finds new and returning devices on the home network and radios through advertisements and queries, without the user entering addresses.",
    d: "On the network, devices announce themselves through multicast service discovery, and the hub browses for known service types. Over radio, devices in pairing mode broadcast beacons that the hub or phone scans. Results are matched against the registry to separate new from known devices and to update changed addresses. It is hard because multicast does not cross network segments, noisy networks flood the hub with announcements, and a device can lie about what it is.",
    k: ["Multicast discovery vs a cloud directory: multicast is local and private, but fails across segments and some mesh access points; a directory works anywhere, but needs the internet.", "Continuous scanning vs scanning on demand: continuous finds returning devices quickly, but wastes power and radio time."],
    p: ["Segmented guest and IoT networks hide devices from discovery, which looks like the device being broken.", "Trusting a discovered device's claimed type lets a malicious device impersonate a lock."],
    v: "Power on a new device on the home network and confirm it appears in the hub's discovered list within the stated time, with the correct type, and does not appear again after being added.",
    dep: ["device-registry","network-segmentation"]
  },
  "qr-code-onboarding": {
    s: "A printed or displayed code on the device that carries its pairing secret and type, scanned by the phone to start commissioning securely without typing.",
    d: "The code encodes a setup passcode, a discriminator that distinguishes this device from others advertising nearby, and the device type or vendor. The phone scans it, finds the matching advertisement and uses the passcode to establish an encrypted session proving physical access. A manual numeric code is an alternative. It is hard because the code is a secret that sits on the box, in photos and in resale listings, so a device's passcode should be unique and ideally paired with a physical action.",
    k: ["Unique per-device passcode vs shared default: unique passcodes stop mass attacks, but require manufacturing to print and store each one.", "Code only vs code plus button press: adding a button press proves physical presence, but makes setup of mounted devices awkward."],
    p: ["A device label photographed in a store or listing lets anyone pair the unit before the buyer.", "Reusing one passcode across a product line makes every unit of it open to the same attack."],
    v: "Scan a device's code, confirm the secure session is established with only that device when three identical units are advertising, and confirm a modified code is rejected.",
    dep: ["local-discovery","commissioning-fabric"]
  },
  "pairing-mode-control": {
    s: "The time-limited state in which the hub accepts new devices, opened deliberately by an authorized person and closed automatically.",
    d: "Pairing mode is opened by an authorized request or a physical button and lasts a short time, such as a few minutes, during which the hub accepts joins and shows progress. For mesh radios the hub also tells routers to permit joining. It is closed after success, timeout or cancel. It is hard because an open window is exactly when an attacker nearby can join a device, so it needs to be short, visible and scoped, and because users start and forget it.",
    k: ["Short automatic timeout vs manual close: automatic closing reduces exposure, but interrupts slow pairing of difficult devices.", "Joining through any router vs only through the hub: any router extends range for new devices, but widens the area an attacker can join from."],
    p: ["Pairing mode left permanently on after a failed attempt lets a neighbor's device join the mesh.", "No visible indicator means residents do not know the home is accepting new devices."],
    v: "Open pairing mode, wait for the timeout without joining anything and confirm the mode closes, the status indicator reverts, and an attempted join afterward is refused and logged.",
    dep: ["household-roles","hub-status-indicators","mesh-network-manager"]
  },
  "commissioning-fabric": {
    s: "The set of cryptographic relationships that tie devices to a home: a shared trust root and per-device certificates that identify which controller may talk to which device.",
    d: "During commissioning the hub acts as a root of trust for the home network, issuing each device an operational certificate under its own authority. Devices and controllers then authenticate each other with these certificates and establish encrypted sessions for every interaction. Several controllers can each hold a place in the device's fabric list. It is hard because it is public key infrastructure on small devices: certificate storage, expiry, rotation and the loss of the root all have to be handled without a support desk.",
    k: ["Hub as the home's certificate authority vs a cloud authority: a local authority works offline and avoids dependence, but a lost hub means losing the root unless backed up.", "Operational certificates per fabric vs one shared network key: per-fabric identities allow selective revocation, but cost more on constrained devices."],
    p: ["Losing the root key without backup requires factory resetting every device in the home.", "Certificates with long fixed lifetimes and no rotation outlive their devices' security."],
    v: "Commission a device, inspect the fabric list on the device to confirm only the hub's identity is present, remove the hub's entry and confirm the device refuses the hub's commands.",
    dep: ["device-key-store","credential-provisioning","device-attestation"]
  },
  "credential-provisioning": {
    s: "Delivers network credentials, keys and identifiers to a newly paired device over the secure session, so it can join the home's network and be controlled.",
    d: "Once the session exists, the hub sends the Wi-Fi name and passphrase or the mesh network key, the device's operational identity, and access control entries that say who may control it. It then verifies the device joined and responds. Credentials should be scoped, so a device gets a segment's credential rather than the main network's. It is hard because failure midway leaves a device half-provisioned, and sharing the home passphrase with every device widens the damage when one is compromised.",
    k: ["Per-device or per-segment credentials vs one shared credential: separate credentials limit a breach, but need network gear that supports them.", "Hub relays credentials vs the phone sends them: the phone can use the OS's stored network, but spreads secrets through more programs."],
    p: ["A mesh key sent in clear during join lets an eavesdropper control every device on the network.", "A failed provisioning that leaves the device in an unknown state needs a factory reset the user may not know how to do."],
    v: "Provision a device, capture radio traffic during the exchange and confirm the network key is never visible in clear, then interrupt provisioning midway and confirm the hub reports the failure and the device can be retried.",
    dep: ["commissioning-fabric","network-segmentation","mesh-network-manager"]
  },
  "device-attestation": {
    s: "A check at pairing that the device is genuine and certified, using a certificate burned into it at manufacture and verified against a published list of trusted makers.",
    d: "The device presents a certificate chain and signs a challenge from the hub. The hub verifies the chain against trusted roots and checks revocation lists, then records the result in the registry. Policy decides what happens with uncertified devices: refuse, warn or allow with limited rights. It is hard because the trust list must be updated over time, makers lose or leak their keys, and legitimate hobby and older devices have no attestation and shouldn't be shut out entirely.",
    k: ["Refuse unattested devices vs allow with a warning: refusing blocks counterfeit hardware, but excludes legitimate do-it-yourself devices.", "Online revocation check vs a periodically updated list: online checks are current, but fail offline, while lists work offline but lag."],
    p: ["A leaked manufacturer key lets counterfeit devices pass attestation until the list is updated.", "A trust list that cannot be updated offline leaves the hub unable to pair anything new after a long outage."],
    v: "Pair a device with a valid certificate and one signed by an untrusted authority and confirm the first is accepted with its maker shown and the second is handled by the configured policy, with a log entry.",
    dep: ["device-key-store","commissioning-fabric","device-registry"]
  },
  "multi-admin-sharing": {
    s: "Lets one device be controlled by several controllers, such as the hub and a second ecosystem, each with its own credentials and permissions.",
    d: "The owner opens a commissioning window on the device from the first controller, which allows a second controller to be added to its fabric list. Each controller gets separate keys and an access control list, so removing one leaves the others working. The device enforces the limits. It is hard because the device has a small number of fabric slots, each controller sees the device from its own viewpoint, and two controllers issuing conflicting commands have no coordination.",
    k: ["Multiple fabrics on the device vs a single controller that bridges: multiple fabrics keep each ecosystem independent and local, but use limited slots; a bridge costs a dependency on the hub.", "Window opened by the owner's approval vs automatic: approval keeps control, but slows sharing."],
    p: ["Exhausting the device's fabric slots makes it impossible to add the next controller without removing one.", "A second controller's automations fighting the hub's rules produces unexplained flicker."],
    v: "Share a light with a second controller, confirm both control it independently, remove the second and confirm the hub's control and rules continue unaffected.",
    dep: ["commissioning-fabric","household-roles"]
  },
  "device-removal-and-reset": {
    s: "The process of cleanly removing a device from the home, wiping its credentials and the hub's records, or recovering when it cannot be reached.",
    d: "A normal removal tells the device to leave the network and erase its fabric credentials, then the hub deletes the registry entry, entities and optionally history. When the device is dead or unreachable, a forced removal deletes the hub's records and flags the device's address and keys as revoked. A factory reset on the device returns it to pairing. It is hard because orphans persist: a device that never heard the removal keeps its credentials and may reappear.",
    k: ["Remove from hub only when device confirms vs allow forced removal: waiting for confirmation prevents orphans, but traps users with broken hardware.", "Delete history with the device vs keep: deleting protects privacy and tidy lists, but breaks energy and trend records that include that device."],
    p: ["A force-removed device still holding the network key remains a trusted member of the mesh.", "Removing a device referenced by rules leaves rules that silently never fire."],
    v: "Remove a reachable device and confirm it resets and the hub deletes records, then force-remove an unplugged one, plug it back in and confirm the hub refuses its traffic and lists the rules that referenced it.",
    dep: ["device-registry","rule-format","mesh-network-manager"]
  },

  "firmware-inventory": {
    s: "A record of every device's make, model, hardware revision and firmware version, with a check against what updates are available and which versions have known vulnerabilities.",
    d: "Versions come from the device during commissioning and later through the protocol's reporting. The hub compares them with update metadata from the vendor or an update feed and shows which devices are outdated, which updates are security fixes and which are optional. It also records the update history. It is hard because many devices do not report versions reliably, some have no update channel, and the inventory itself reveals the exact attack surface of the home if leaked.",
    k: ["Query versions on demand vs track continuously: continuous tracking keeps lists current, but wakes sleepy devices and uses battery.", "Central feed vs vendor-specific sources: one feed simplifies, but cannot cover every device, and the vendor's own source is authoritative."],
    p: ["An inventory that treats unreported versions as up to date hides devices that never receive fixes.", "A shared inventory in the cloud maps the home's vulnerabilities for anyone who breaches it."],
    v: "Pair three devices with different firmware, confirm the list shows each version, marks the one with a known vulnerability, and records a version change after an update.",
    dep: ["device-registry","vulnerability-response"]
  },
  "update-manifest-signing": {
    s: "Signed metadata describing an update image: version, target hardware, hash, size and compatibility, so only genuine, intended firmware is installed.",
    d: "The vendor signs a manifest that names the image, its hash and the hardware and prior versions it applies to. The hub verifies the signature and compatibility before downloading, and checks the hash after, and the device verifies again before installing. Keys are chained and rotated with a plan for compromise. It is hard because a signing key is the most valuable secret in the system, and anti-rollback rules must prevent an attacker from installing an old vulnerable version that is validly signed.",
    k: ["Verify at both hub and device vs only at the hub: device verification means a compromised hub cannot install bad firmware, but costs code on small devices.", "Anti-rollback counters vs allowing downgrades: counters block reinstalling vulnerable versions, but make a bad update harder to undo."],
    p: ["Accepting any validly signed image lets an attacker downgrade a device to a vulnerable version.", "A signing key kept on a build server is exposed when the build system is breached."],
    v: "Offer the hub a manifest with a wrong signature, a mismatched hash and an older version, and confirm all three are rejected before any bytes reach a device, with the reasons logged.",
    dep: ["firmware-inventory","device-key-store"]
  },
  "update-scheduling": {
    s: "Chooses when to install updates: at night, when nobody is home or when the device is idle, with owner policy for automatic or manual approval.",
    d: "The scheduler takes policy, such as automatic security updates and manual feature updates, and the device's state: avoid updating a lock while guests are arriving or a heater during a cold night. It checks battery level, link quality and presence, and batches devices to limit radio load. A device being updated is unavailable for a short time. It is hard because an update reboot of a critical device, like the alarm, creates a window with no protection, and users are rarely asked at a good moment.",
    k: ["Automatic security updates vs owner approval for all: automatic closes vulnerabilities fast, but risks an unwanted change; approval gives control, but many homes never click.", "One device at a time vs parallel: sequential limits the effect of a bad update, but takes long in a home with many devices."],
    p: ["Updating all lights at 7 a.m. leaves the house dark when people wake up.", "Updating a battery sensor at low charge kills it mid-transfer."],
    v: "Set a night window and approve an update for six devices, then confirm updates run in the window one at a time, skip a device with a low battery, and report each result.",
    dep: ["firmware-inventory","presence-detection","mode-state-machines"]
  },
  "staged-rollout": {
    s: "Releases an update gradually, first to a few devices or homes, watching for failures and halting when they exceed a threshold.",
    d: "The vendor service marks an update with a rollout percentage and cohort rules. Within a home, the hub can update a single device of a type first and verify it works before the rest. Telemetry on update outcome, device availability and crash rate after the update decides whether to proceed. It is hard because failures can be subtle: an update succeeds but a feature breaks, and unless health checks are defined, rollout continues and spreads the damage.",
    k: ["Automatic halt on a failure threshold vs human decision: automatic halt limits damage quickly, but may stop on noise or on an unrelated failure.", "Canary within a home vs across homes: in-home canaries need no telemetry, but only help homes with several of the same device."],
    p: ["Measuring only install success misses an update that installs fine and then breaks pairing.", "Rolling out to every home on the same day makes a firmware bug a mass outage."],
    v: "Release an update that fails its post-update health check on the first canary device and confirm the rollout halts, the remaining devices stay on the old version and the owner is notified.",
    dep: ["update-scheduling","availability-tracking","update-manifest-signing"]
  },
  "transfer-and-flash": {
    s: "Moves the firmware image to the device in small verified blocks over its radio and has the device write and activate it.",
    d: "The hub or an update server announces an image; the device requests blocks at a rate it can handle, checks each block and the full hash, writes the image to a spare area and reboots into it. Sleepy devices fetch when awake. Mesh transfers share bandwidth with normal traffic, so they are rate limited. It is hard because links are slow and lossy, the transfer can take hours for tiny devices, power can fail during flash writes, and the device must remain reachable throughout.",
    k: ["Device pulls blocks vs hub pushes: pulling lets devices control the pace and sleep, but needs state on the hub per device; pushing is simple but can overwhelm a slow device.", "Dual image slots vs in-place overwrite: two slots let a failed update recover, but need twice the flash."],
    p: ["A large transfer on a busy mesh makes lights and sensors unresponsive for the duration.", "A device that loses power mid-write with no fallback image becomes unusable."],
    v: "Update a battery device over a lossy link with ten percent packet loss, interrupt power mid-transfer, and confirm it resumes or restarts the transfer, then boots the verified new image.",
    dep: ["update-manifest-signing","mesh-routing","low-power-mesh-radio"]
  },
  "rollback-and-recovery": {
    s: "Returns a device to its previous working firmware when a new one fails to start or fails health checks, and recovers devices that cannot start at all.",
    d: "After flashing, the new image runs in a trial mode and must confirm itself healthy within a time limit, such as reconnecting to the network. If not, the bootloader reverts to the earlier image. The hub detects the device did not return, logs the failed version and blocks retries. A recovery mode accepts a new image through a wired or short-range path. It is hard because health checks have to be meaningful, and some failures, such as a radio that never comes up, leave the device unable to say anything.",
    k: ["Automatic revert after a timeout vs requiring confirmation: automatic revert recovers unattended devices, but can revert good firmware on a slow network.", "Bootloader recovery path vs none: a recovery path saves bricked units, but adds code that must itself be secure."],
    p: ["A trial window shorter than the device's slow first boot reverts every update and loops forever.", "No block on retrying a bad version makes the hub reinstall it on every scheduled update."],
    v: "Install a deliberately broken image on a test device and confirm it reverts to the previous version within the trial time, reports the failure, and the hub refuses to offer that version again.",
    dep: ["transfer-and-flash","firmware-inventory","availability-tracking"]
  },
});
