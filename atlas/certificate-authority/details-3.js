// Details for the certificate authority plate, part 3: key hierarchy, signing infrastructure, hardware and custody.
ATLAS.details("certificate-authority", {
  "root-ca": {
    s: "The self-signed trust anchor at the top of a hierarchy, kept offline and used only to sign intermediates, revocation lists for them, and occasionally its own renewal.",
    d: "The root key lives in hardware stored in a secure facility, powered off, and is activated only in a scripted ceremony with several witnesses. It signs a handful of intermediate certificates over many years, and a periodically refreshed revocation list covering them. Clients trust the root by installation, not by any signature, so its security is the security of the whole hierarchy. Hard because the root cannot be replaced quickly: replacement requires rolling out a new root to every client.",
    k: ["Offline root vs online root: offline reduces attack exposure to nearly zero; online allows quick signing and makes the root a normal target.", "Long root lifetime vs short: long lifetime reduces distribution churn; short limits the period of key exposure and forces regular renewal."],
    p: ["A root key that is accidentally connected to a network or used for end-entity certificates loses the benefit of being offline.", "A damaged or lost hardware token with no backup ends the hierarchy."],
    v: "At the scheduled check, inventory the root hardware, verify seals and access logs, and confirm no signing event has occurred since the last recorded ceremony.",
    dep: ["hsm-cluster", "key-ceremony", "m-of-n-activation", "facility-security"]
  },
  "intermediate-ca": {
    s: "Online issuing authorities signed by a root, each with its own key and certificate, that actually sign subscriber certificates and can be replaced without replacing the root.",
    d: "An intermediate has a certificate from the root, constraints on what it may issue, and a private key in an online hardware module reachable only from the signing service. Several intermediates exist for different profiles and for redundancy. If one is compromised, it can be revoked by the root and replaced while the root and other intermediates stay trusted. Hard because each intermediate's lifetime and name must be planned, and its key is under constant use.",
    k: ["Many intermediates vs few: many limit damage and allow independent rotation; few are simpler to operate and distribute.", "Intermediates by purpose vs by time: by purpose isolates risk between product lines; by time simplifies expiry planning."],
    p: ["An intermediate that expires before the planned replacement is in place stops issuance and breaks chains.", "Sharing one intermediate across unrelated profiles makes one flaw affect all customers."],
    v: "Validate a certificate issued by each intermediate through its chain to the root, and confirm that the intermediate's constraints reject a certificate for a disallowed name in a strict client.",
    dep: ["root-ca", "path-constraints", "hsm-cluster"]
  },
  "hierarchy-segmentation": {
    s: "Dividing the hierarchy into separate roots and issuers per purpose, region or customer class, so a failure or distrust event in one does not take down the rest.",
    d: "Separate hierarchies serve different uses: web servers, client authentication, code signing, internal services, test. Each has its own root, profile and policy, and may be audited and distributed on its own schedule. Distrust of one root removes only its subtree. Private authorities often use one root per environment. The cost is operational: every root needs its own ceremonies, audits and distribution, and customers must handle more chains.",
    k: ["Separate hierarchies per purpose vs one shared: separate limits harm and lets purposes follow different rules; one is simpler to run and distribute.", "Dedicated test hierarchy vs reuse production keys: dedicated keeps test mistakes out of the trusted tree; reuse reduces setup and risks real misuse."],
    p: ["A test intermediate signed by a production root is trusted by real clients.", "Too many hierarchies leave some without proper audit coverage."],
    v: "List every root and intermediate with its purpose, audit scope and trust store inclusion, and confirm each purpose-specific usage limit prevents its certificates validating for another purpose.",
    dep: ["root-ca", "intermediate-ca"]
  },
  "path-constraints": {
    s: "Limits placed in a CA certificate on how deep a chain below it may go, and which names, usages and policies its descendants may use.",
    d: "Basic constraints state whether the key can sign and the maximum number of further authorities below it. Name constraints list permitted and excluded name spaces. Extended usage in a CA certificate restricts what descendants may be used for. Clients enforce these during path validation. They are the tool that makes a bridge or an enterprise subordinate safe: even if its key leaks, it cannot issue outside its permitted names. Hard because client support for constraints varies and errors are not detected until a real chain fails.",
    k: ["Technically constrained subordinates vs unconstrained: constrained limits what a delegated authority can ever do; unconstrained is flexible and requires auditing the subordinate fully.", "Critical vs non-critical name constraints: critical is enforced by strict clients and rejected by some old ones; non-critical is ignored by some."],
    p: ["A path length limit set too low prevents adding a needed intermediate without a new root.", "Name constraints that exclude an unexpected case reject legitimate certificates."],
    v: "Issue a test certificate outside a subordinate's permitted names and confirm several independent clients refuse the chain. Issue one inside the names and confirm all accept.",
    dep: ["intermediate-ca"]
  },
  "key-ceremony": {
    s: "A scripted, witnessed, recorded procedure for operations on root keys: generating keys, signing intermediates, backing up and restoring, with every step checked against a written plan.",
    d: "The procedure is rehearsed, reviewed and executed in a controlled room with trusted role holders, an independent witness and an auditor. Hardware is checked, a clean environment is booted, keys are generated or used, outputs are exported and hashed, and tamper-evident bags seal media. Everything is video recorded and a report is signed. Hard because the value is in discipline: a deviation, even a harmless one, must be recorded, and the script must be followed exactly.",
    k: ["Full ceremony with witnesses vs lighter procedure: full is expensive and gives strong evidence; lighter is quick and less convincing for the root.", "Fixed script vs flexible steps: a fixed script is auditable; flexibility handles surprises and invites unrecorded changes."],
    p: ["An undocumented workaround during a ceremony becomes a finding and may force a repeat.", "Operators who have never rehearsed make mistakes under the pressure of an audience."],
    v: "Review the ceremony report and video against the script: each step is signed, hashes of outputs match the published certificate and the sealed bag identifiers match the storage register.",
    dep: ["hsm-cluster", "m-of-n-activation", "trusted-roles", "key-generation"]
  },
  "rollover": {
    s: "Replacing an authority key or certificate before expiry or after compromise, while keeping existing certificates valid and clients able to build paths.",
    d: "A new key and certificate are created in advance, often cross-signed by the old one. Issuance switches to the new intermediate on a planned date; old certificates remain valid until they expire, and the old intermediate stays published. Chains offered to clients change at the switch. A root rollover is much slower because it needs client updates. Hard because the timeline spans years, and because anything that was pinned or cached to the old key breaks.",
    k: ["Planned rollover well before expiry vs at the deadline: early gives time to find breakage; late reduces the number of overlapping keys.", "Same name for the new key vs a new name: the same name eases chain matching and creates ambiguity; a new name avoids confusion."],
    p: ["A rollover rehearsed only on paper discovers client breakage after the switch.", "Pinned certificates in applications reject the new issuer even though it is correct."],
    v: "Before the switch, issue certificates from the new intermediate in a staging environment and validate with a representative client set; after the switch, confirm old and new certificates both chain correctly.",
    dep: ["intermediate-ca", "cross-signing", "key-generation", "key-ceremony"]
  },
  "algorithm-agility": {
    s: "The ability to move to new signature algorithms and key types, including those resistant to quantum computers, without breaking existing clients or certificates.",
    d: "Hierarchies can be created with new algorithms in parallel with old ones, and profiles can choose among them. Moves depend on client support, hardware module support and size: some new signatures are much larger and affect handshakes, lists and logs. Plans cover hybrid certificates, separate hierarchies and timelines. Hard because relying parties update slowly, standards are still evolving, and a rushed migration may lock in an immature choice.",
    k: ["Parallel hierarchies with new algorithms vs replacing in place: parallel lets clients migrate gradually; replacing in place is simpler and breaks older clients.", "Hybrid signatures vs pure new algorithm: hybrid hedges against a flaw in either; it grows size and complexity."],
    p: ["Hardware that cannot support a new algorithm blocks the migration for years.", "Larger signatures cause handshake failures in devices with small buffers."],
    v: "Issue a test chain with the candidate algorithm, then record handshake size, validation time and success rate across the representative client set and compare with current figures.",
    dep: ["hsm-cluster", "key-requirements"]
  },
  "signing-service": {
    s: "The service that holds the connection to the key hardware and produces signatures for approved certificates, lists and status responses, and nothing else.",
    d: "It is a narrow, hardened service with a small API: sign this prepared object with this key. It authenticates the caller, applies signing policy, sends the digest to the hardware module and returns the signature. It is isolated from request-handling networks and has no inbound path from the internet. It records every operation. Hard because it is both the most protected and most heavily used component: it must stay small, fast and available while resisting every attempt to make it sign something unintended.",
    k: ["Signing service accepts structured requests it can check vs raw digests: structured requests allow policy checks; raw digests are simple and sign anything the caller says.", "Dedicated service per key vs shared service: dedicated limits what a compromise can sign; shared is easier to run."],
    p: ["A signing service that signs raw digests turns a compromised caller into a signing oracle for any content.", "Throughput limited by the hardware module queues requests and stalls issuance."],
    v: "Send the service a request that violates policy, such as wrong profile for the key, and confirm it refuses and logs it, then send a valid request and confirm the signature verifies.",
    dep: ["signer-authentication", "signing-policy", "hsm-cluster", "signing-audit-log"]
  },
  "signer-authentication": {
    s: "Verifies that a signing request comes from an authorized component, using mutual authentication and per-caller permissions tied to specific keys and operations.",
    d: "Callers present identities, such as certificates issued from an internal authority, and the signing service checks them against a permissions table: which caller may use which key for which object type. Requests are bound to the caller and carry a nonce to prevent replay. Credentials are short-lived and rotated. Hard because the callers are exactly what an attacker wants to impersonate, so identity must not be a shared secret on a flat network.",
    k: ["Per-caller key permissions vs a single trust level: per-caller limits what a stolen identity can sign; a single level is easier to configure and gives all or nothing.", "Short-lived caller credentials vs long: short limits theft windows and needs automation; long is easy and risky."],
    p: ["A shared service account across callers makes attribution impossible after an incident.", "A permission granted for a test and never removed lets a test client sign production objects."],
    v: "Present a valid identity that lacks permission for a production key and confirm the request is denied and logged with the caller identity.",
    dep: ["signing-service"]
  },
  "signing-policy": {
    s: "Rules the signer applies to every request: the object type, profile and fields must match what the key is authorized to sign, with rate and volume ceilings.",
    d: "Before signing, the service parses the object and checks it independently: issuer name matches the key, extensions are permitted for that key's profiles, validity is within limits, and for certificates, evidence of lint and logging is present. Rate ceilings per key stop runaway or malicious signing. Alerts fire at thresholds. Hard because duplicating checks from the issuance path feels wasteful, yet it is what ensures a compromised upstream cannot get arbitrary certificates signed.",
    k: ["Independent re-checking in the signer vs trusting the issuer: re-checking contains a compromised pipeline; it duplicates logic that must be kept in sync.", "Hard rate ceilings vs alerts only: ceilings stop abuse and can stop real surges; alerts avoid outages and depend on human response."],
    p: ["Policy that checks only names but not usages allows a certificate with CA capability to be signed.", "A ceiling set to normal volume blocks issuance during mass renewal."],
    v: "Submit a certificate that has CA capability to a key authorized only for server certificates, and a burst above the ceiling; confirm both are refused and both create alerts.",
    dep: ["signing-service", "certificate-profiles"]
  },
  "delegated-responder-keys": {
    s: "Separate, lower-value keys authorized by the issuing key to sign only status responses and lists, so the issuing key is not used for high-volume signing.",
    d: "The issuing authority creates a responder certificate with a usage that allows only status signing, and a marker so clients accept responses signed by it. These keys can be held in separate hardware, rotated often, and used by pre-signing jobs. If one is compromised, only status responses are at risk, and the key can be replaced without touching the issuing key. Hard because clients vary in how they treat delegated signers and responder certificate expiry.",
    k: ["Delegated responder key vs signing with the issuing key: delegation limits exposure; direct signing avoids extra certificates and keeps the most valuable key in constant use.", "Short-lived responder certificates vs long: short limits compromise windows and needs automated rotation."],
    p: ["A responder certificate that expires unnoticed makes every status response invalid at once.", "Some clients reject delegated responses, which only shows in testing across many clients."],
    v: "Fetch a status response, extract the signer certificate and confirm it chains to the issuing key with the status-signing usage only, and verify with several clients.",
    dep: ["intermediate-ca", "hsm-partitions"]
  },
  "signing-audit-log": {
    s: "A tamper-evident record of every signing operation, with what was signed, by which key, requested by whom and when, kept separately from the signer.",
    d: "Each operation writes a record containing a digest of the object, key identifier, caller, policy decision and timestamp. Records are chained or sent to a separate store that signers cannot modify, and reconciled against the issued certificate database and public logs. Gaps or extra signatures signal a problem. Hard because high signing volumes create very large logs, and because the log is only valuable if someone actually reconciles it.",
    k: ["Write-once remote store vs local log: remote is hard for an attacker to alter; local is simple and can be changed by whoever owns the host.", "Log digest only vs full object: digest only is small and sufficient to match; full objects help investigation and cost storage."],
    p: ["Logs kept on the same host as the signer are erased by whoever compromises it.", "Reconciliation done yearly finds unauthorized signatures long after they were used."],
    v: "Compare daily counts of signing records with issued certificates plus lists and responses; confirm they match exactly and that a deliberate extra signature in test produces an alert.",
    dep: ["event-logging"]
  },
  "signing-availability": {
    s: "Design for keeping signing available despite failures: redundant modules and hosts, load balancing across key copies and graceful behavior when signing is unavailable.",
    d: "Hardware modules are clustered with key material replicated in a controlled way, and signing hosts sit in several sites. Callers retry across nodes and queue requests when capacity is short. Some operations such as status signing can be pre-computed so a short outage is invisible. The design decides which operations stop when signing stops: new issuance stops, but existing status should continue. Hard because replicating keys increases exposure, and capacity planning needs to cover renewal peaks.",
    k: ["Active-active sites with replicated keys vs a single site with cold standby: active-active survives a site loss; replication of key material adds copies to protect.", "Queue requests during outages vs fail fast: queueing hides short blips; fast failure prevents unbounded backlog and stale requests."],
    p: ["All hardware modules in one rack lose power together.", "Failover that was never tested turns out to need a person with a card who is unavailable."],
    v: "Disable one signing site during a load test and confirm issuance continues at reduced rate with no failed requests beyond the retry budget, and status responses stay valid.",
    dep: ["hsm-cluster", "signing-service"]
  },
  "hsm-cluster": {
    s: "Tamper-resistant hardware modules that generate and hold private keys and perform signing internally, so the key never exists in usable form outside them.",
    d: "A module is a certified device with its own processor, storage and physical tamper response. Applications send digests; the module returns signatures. Modules are grouped for capacity and redundancy, with keys shared between them by wrapped transfer. Access is controlled by roles and credentials held on separate tokens. Hard because performance is limited to what the hardware can sign, and because vendor-specific interfaces, firmware and certification status all constrain what operations are possible.",
    k: ["Network-attached modules vs cards inside hosts: network-attached are shared and flexible; cards have fewer network exposures and tie keys to hosts.", "Certified modules vs generic key storage: certification gives audit credibility; it is costly and limits algorithm and firmware choices."],
    p: ["A firmware update that changes behavior stops signing in production.", "Capacity sized for average load stalls during a mass renewal."],
    v: "Confirm that an export request for a key marked non-exportable fails, that signing throughput meets the target in a load test, and that the module reports tamper and health status.",
    dep: ["hsm-partitions", "hsm-attestation", "facility-security"]
  },
  "key-generation": {
    s: "Creating authority key pairs inside the hardware, with documented randomness, parameters and witnesses, so no copy of the private key exists beforehand.",
    d: "Keys are generated inside the module using its certified random source, with the intended algorithm, size and attributes, such as non-exportable, set at creation. For roots this happens during a ceremony; for issuing keys it happens during planned provisioning. The resulting public key is exported and hashed, and the hash is recorded and witnessed. Hard because mistakes at creation, such as wrong attributes or exportable keys, cannot be fixed afterwards; the key must be replaced.",
    k: ["Generate inside the module vs import: generation inside means the key never exists elsewhere; import allows prior backups and exposes the key during import.", "Setting non-exportable at creation vs allowing export for backup: non-exportable is safest; backups must then be made via wrapped replication."],
    p: ["A key generated with the wrong attributes is discovered only when backup or rotation is needed.", "Public key not recorded at creation cannot later be proved to match the hardware key."],
    v: "Query the module for the key's attributes and confirm non-exportable and the intended algorithm, and match the exported public key hash to the ceremony record.",
    dep: ["hsm-cluster", "hsm-partitions"]
  },
  "key-backup": {
    s: "Protected copies of authority keys that allow recovery after hardware loss, stored under split control and in separate locations.",
    d: "Keys are wrapped inside the module under a key encryption key that itself is split into shares held by several people, and the wrapped blob is stored in separate secure locations. Restoring requires a threshold of share holders and a compatible module. Roots usually keep several backups; issuing keys may rely on replicated live modules plus a cold backup. Hard because backup increases the places the key exists, so every copy needs the same protection and a recorded inventory.",
    k: ["Backups vs no backup and reissue from a new key: backups preserve the hierarchy; no backup avoids extra exposure and requires a new root after loss.", "Share holders at different sites vs one site: separate sites survive a disaster; one site is simple and loses all if destroyed."],
    p: ["A backup that has never been restored might not work when needed.", "Share holders leaving the organization without handing over their shares lowers the effective threshold."],
    v: "Restore a backup into a spare module in a rehearsal using the threshold of share holders and sign a test object that verifies with the original public key.",
    dep: ["hsm-cluster", "m-of-n-activation", "facility-security"]
  },
  "m-of-n-activation": {
    s: "Requiring several authorized people, each holding a separate credential, to be present before a sensitive key can be used or an operation performed.",
    d: "Credentials are smart cards or tokens held by distinct role holders; the module requires a threshold, such as three of five, to activate a key or perform administration. Credentials are kept in separate safes and signed out. Online keys may be activated at boot and stay active; offline roots are activated per ceremony. Hard because the threshold must balance abuse resistance and availability: too high and illness blocks critical work; too low and collusion is easy.",
    k: ["Higher threshold vs lower: higher resists collusion and coercion; lower tolerates absences and makes emergencies easier.", "Credentials that stay in the module after activation vs removed: staying keeps services running; removing limits time of exposure."],
    p: ["Credential holders storing cards together defeats the separation.", "Too few trained holders makes the threshold unreachable during an emergency."],
    v: "Attempt an activation with one fewer credential than the threshold and confirm refusal; repeat with the threshold and confirm success and a logged event naming the holders.",
    dep: ["trusted-roles", "hsm-cluster"]
  },
  "hsm-partitions": {
    s: "Logical divisions inside the hardware with separate owners, credentials and keys, so different hierarchies and functions cannot touch each other's keys.",
    d: "A module can host several partitions, each with its own administrators, users and policies. Production issuing keys, responder keys, test keys and root keys are placed in different partitions or devices. Roles inside a partition separate those who create keys from those who use them. Audit records are kept per partition. Hard because partitions share the hardware, so a firmware flaw or exhausted capacity can cross them, and configuration mistakes are common.",
    k: ["Partition per hierarchy vs one for all: separate partitions limit damage from credential misuse; one is easier to manage.", "Separate physical devices for the most sensitive keys vs partitions: devices give hard isolation; partitions save cost."],
    p: ["Test keys in a production partition allow test tools to sign with real authority.", "Administrator credentials reused across partitions defeat the separation."],
    v: "Using credentials for one partition, attempt to list or use keys in another; confirm access is denied and an event is logged.",
    dep: ["hsm-cluster"]
  },
  "hsm-attestation": {
    s: "Evidence from the hardware, signed by its manufacturer, that a key was generated inside a genuine, correctly configured module and cannot be exported.",
    d: "The module signs a statement containing the key's public part, attributes and its own identity and firmware version, using a device key chained to the manufacturer. An auditor or the authority verifies this chain. Firmware is updated under controlled procedures, with version records and certification status checked. Hard because attestation proves hardware state at creation and says little about later misuse, and firmware updates must be weighed against certification.",
    k: ["Requiring attestation for every key vs only roots: every key gives uniform evidence; only roots is cheaper and leaves issuing keys on trust.", "Updating firmware promptly vs staying on certified version: prompt fixes flaws; staying keeps certification and leaves known issues."],
    p: ["Attestation stored but never verified provides no evidence at all.", "Unplanned firmware updates change behavior and certification status mid-audit."],
    v: "Fetch the attestation for each production key, verify its chain to the manufacturer and confirm the firmware version appears on the approved list.",
    dep: ["hsm-cluster", "key-generation"]
  },
  "key-destruction": {
    s: "Securely and verifiably erasing authority keys and all copies at the end of their life, with witnesses and a record that nothing remains.",
    d: "At retirement, each module copy is zeroized or the key deleted, backups are destroyed and logged, and share credentials are retired. A destruction ceremony records serial numbers of devices and media. Retired keys may stay published as certificates but cannot sign. Hard because completeness must be shown: every backup and replica listed in the inventory must be accounted for, and any unlisted copy invalidates the claim.",
    k: ["Destroy at retirement vs retain for possible future need: destruction removes risk; retention allows signing final revocation lists and risks leaks.", "Destroy hardware vs wipe and reuse: destruction is conclusive; wiping saves cost and relies on the module's erase."],
    p: ["Forgotten backups mean a retired key still exists years later.", "Destroying a key before its last revocation list is signed leaves relying parties with a dead end."],
    v: "Compare the key inventory with destruction records and confirm every copy is marked destroyed with witness signatures; attempt to use the key identifier on each module and confirm failure.",
    dep: ["key-backup", "trusted-roles", "key-ceremony"]
  },
  "facility-security": {
    s: "The physical protection of key hardware and operations: controlled rooms, layered access, surveillance, tamper-evident storage and procedures for visitors and equipment.",
    d: "Hardware sits in locked cages in controlled rooms, with layered access requiring multiple people, logged badges and cameras. Offline roots are stored in safes with seals recorded. Equipment enters and leaves with a log. Sites have power, fire and environmental controls and a disaster recovery counterpart. Hard because physical controls degrade through habit, such as propped doors and shared badges, and they must be tested rather than assumed.",
    k: ["Multiple sites with copies of hardware vs one hardened site: multiple sites survive disasters; one site is simpler and a single point of loss.", "Own facility vs hosted space: own gives complete control and cost; hosted needs contractual and audited controls."],
    p: ["Maintenance staff with unescorted access can reach the equipment.", "Seals recorded but never inspected provide no evidence of tampering."],
    v: "Walk through the access path with an auditor, test that a single person cannot enter the key room alone, and compare seal numbers on sealed items with the register.",
    dep: []
  },
});
