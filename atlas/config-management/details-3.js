// Details for the configuration management plate, part 3: inventory, node data and secrets.
ATLAS.details("config-management", {
  "static-inventory": {
    s: "A hand-maintained list of nodes and the groups they belong to, stored as a file in version control, the simplest way to say which machines exist.",
    d: "The inventory names each machine, its address and its groups, with optional per-node variables, in a text file or directory tree. Because it lives in version control, changes are reviewed and history is kept. It suits small, stable fleets and bootstrapping. The weakness is that it describes intent, not reality: machines created by autoscaling or cloud tooling are missing until someone edits the file, and removed machines linger as unreachable entries that fail every run.",
    k: ["Static file vs generated from a source of truth: static is transparent and reviewable; generated stays correct as the fleet changes but depends on the source.", "One large inventory vs one per environment: one large file shows everything; per environment limits the damage of an edit."],
    p: ["A machine is retired and left in the file, and every fleet-wide run reports it as failed.", "Variables set inline in the inventory compete with data files, and nobody knows which wins."],
    v: "Add a node to the inventory file, run a selection query for its group, and confirm it is listed and reachable, then remove it and confirm no run targets it.",
    dep: []
  },
  "dynamic-inventory": {
    s: "Builds the node list on demand from an external source such as a cloud account, virtualization manager or asset database, so the inventory follows the fleet.",
    d: "A plugin or script queries the source at run time, maps its attributes such as tags, regions and instance types to groups and variables, and returns the result in the system's inventory format. Results may be cached for speed. This keeps inventory accurate under autoscaling and removes duplicate bookkeeping. It is hard because the source's tags become the grouping logic, so a mistagged machine silently joins or leaves a group, and a query that fails or returns partial data can look like the fleet shrank.",
    k: ["Query live each run vs cache the result: live is accurate but slows every run and depends on the source; cached is fast but can be stale.", "Group by source tags vs maintain mapping in the system: tags are convenient; a separate mapping gives control when tag hygiene is poor."],
    p: ["The source API returns a partial list during an outage, and the run treats missing nodes as removed.", "A tag typo moves a production node into a test group that receives untested changes."],
    v: "Create a machine in the source with a known tag, refresh the inventory, and confirm the machine appears in the matching group, and that deleting it removes it within the cache period.",
    dep: ["node-groups", "fact-cache"]
  },
  "node-groups": {
    s: "Named sets of nodes, by environment, role, location or any attribute, used to select targets, attach data and scope permissions and rollouts.",
    d: "Groups can be explicit lists, rules over facts, or nested hierarchies. A node usually belongs to several, such as production, web tier and a region. Groups are the vocabulary for everything else: data is attached to them, runs and rollouts target them, and access control is scoped to them. They become hard to manage when membership rules overlap, because a node's behavior depends on which groups match and in what order they apply.",
    k: ["Rule-based membership vs explicit lists: rules follow the fleet automatically; explicit lists are predictable but demand maintenance.", "Deep nesting vs flat tags: nesting expresses inheritance; flat tags are simpler to query but lose structure."],
    p: ["A node matches two groups that set the same value differently, and behavior depends on evaluation order.", "A group used for access scoping is also edited for convenience, widening permissions without review."],
    v: "Ask the system to list all groups for one test node and the effective data each contributes, and confirm the list matches the rules that should apply and nothing else.",
    dep: ["facts-collector"]
  },
  "node-classifier": {
    s: "Decides, for each node, which role, groups, environment and parameters apply, by consulting a rule set, a directory or an external service when the node asks for its plan.",
    d: "When a plan is requested, the classifier takes the node's name and facts and returns the classes or roles to apply, the environment to use and top-level parameters. It may be a console with rules, a script querying an asset system, or a simple map file. It is the point at which the system decides what a machine is. It is hard because it sits in the critical path of every run, must answer quickly, and a wrong answer applies the wrong configuration.",
    k: ["Classification by name pattern vs by explicit assignment: patterns need no bookkeeping but misclassify odd names; assignment is exact and laborious.", "External classifier service vs built-in rules: external reuses existing records; built-in is one less dependency to fail."],
    p: ["The classifier is unreachable, and the server falls back to an empty or default classification that strips nodes of their roles.", "A rule that matches by name captures a new machine that happens to resemble production."],
    v: "Request the classification for a test node and confirm it returns the expected role and environment, then stop the classifier and confirm the run fails rather than applying a default.",
    dep: ["facts-collector", "node-groups"]
  },
  "facts-collector": {
    s: "Gathers information about each node, such as operating system, network interfaces, memory, disks and installed versions, and supplies it to the planner as variables.",
    d: "On each run the agent executes a collector that inspects the machine and builds a structured set of facts, which is sent with the plan request. Code uses facts for conditions and templates, and the server stores them for queries. Facts are cheap to read but must be accurate and fast: a collector that stalls on an unreachable network mount delays every run. The difficulty is trust, since facts come from the node being configured, and a compromised node can claim to be a different kind of machine.",
    k: ["Collect all facts every run vs only requested ones: all facts are simple and queryable; selective collection is faster but needs the code's needs known up front.", "Trusted node-reported facts vs server-verified attributes: node-reported is easy; server-verified protects against lying nodes but needs a source of truth."],
    p: ["A slow probe, such as one querying a hung network mount, makes the whole run time out.", "Code trusts a self-reported role fact to decide which secrets a node receives."],
    v: "Run the collector on a test node and compare the reported memory, address and operating system release with values read directly from the machine, confirming they agree.",
    dep: ["os-abstraction"]
  },
  "custom-facts": {
    s: "Site-defined facts produced by small scripts or files on the node, exposing local information such as the application version, rack location or a hardware serial number.",
    d: "Operators drop scripts or static files into a facts directory, or ship them with modules, and the collector runs them and merges output into the fact set. They bridge information that only the node knows to the central plan, for instance which disk is the data disk. They are powerful and risky: facts execute on every run, a slow or failing script harms every plan, and facts set by local files can be edited by anyone with access to the node.",
    k: ["Executable facts vs static files: executables report live values; static files are fast and safe but go stale.", "Facts shipped with modules vs placed by hand: shipped facts are versioned with the code; hand-placed facts are quick and invisible to review."],
    p: ["A custom fact script hangs, and every run on the node fails before any resource is checked.", "A local fact overrides a built-in name and changes behavior on one machine only."],
    v: "Add a fact script returning a known value, run collection on the test node, and confirm the value appears in the plan request, then make the script fail and confirm the run reports it rather than stalling.",
    dep: ["facts-collector", "timeouts-and-cancellation"]
  },
  "fact-cache": {
    s: "Stores the most recent facts for each node on the server, so plans can be compiled and queries answered without contacting the node.",
    d: "Facts from each run are saved with a timestamp and expiry. Dynamic inventory, agentless runs and offline planning use them to compile for a node that is not currently connected, and queries ask which nodes have a given OS release. A backing store can be files, a database or a shared cache. The challenge is staleness: stored facts describe the node as of its last report, so a plan compiled from old facts may be wrong, and there is no signal inside the data that it is old.",
    k: ["Short expiry vs long expiry: short is fresh but forces more collection; long reduces load but misleads after upgrades.", "Per-node files vs shared database: files are simple; a database supports queries across the fleet and concurrent servers."],
    p: ["A node upgrades its operating system and the plan compiles against the old release's facts for a day.", "The cache holds facts for retired nodes, and queries count machines that no longer exist."],
    v: "Upgrade a package on a test node, run collection, and confirm the cached fact changes with a new timestamp, and that a query returns the new version.",
    dep: ["facts-collector", "state-database"]
  },
  "hierarchical-data-lookup": {
    s: "Looks up a setting by key through an ordered list of data sources, from most specific such as the node to most general such as defaults, and returns the first or merged result.",
    d: "A hierarchy defines layers with paths templated on facts, such as per node, per role, per environment and common. Lookup walks it for a key. Data lives in files, a database or an external service, and the same code gets different values on different nodes. Keeping data in this structure separates what from where. It is hard because the ordering is a policy: choosing to put environment above role changes outcomes, and a long hierarchy means a value's origin is far from where it is used.",
    k: ["Many specific layers vs few: many layers give fine control; few layers are easy to follow.", "Plain files vs a database backend: files are reviewable in version control; a database allows fast edits and fleet-wide queries but loses review history."],
    p: ["A key is defined at a high layer and a typo prevents the intended override, so the default applies silently.", "A node's name appears in a path layer, and renaming the machine loses its data."],
    v: "Look up a key for a test node with an explain option and confirm the output lists each layer checked, the layer that supplied the value and the final result.",
    dep: ["facts-collector", "precedence-rules"]
  },
  "secret-store-integration": {
    s: "Fetches secrets from a dedicated secret manager at compile or run time, so sensitive values never live in the configuration repository.",
    d: "Code refers to a secret by path, and a lookup function or agent-side plugin retrieves it from the store using the system's own credentials, subject to the store's policy. Secrets can be resolved on the server during compilation or on the node during the run. Node-side retrieval means the server never sees the value, but each node needs its own access. The difficulty is availability and scope: the store becomes a hard dependency of every run, and granting the server blanket read access makes it a single point of compromise.",
    k: ["Resolve on the server vs on the node: server resolution needs one credential but concentrates risk; node resolution limits each node to its own secrets and multiplies credentials.", "Fail the run when the store is down vs use cached values: failing is safe but halts changes; cached values keep working but may be stale."],
    p: ["The server's token can read every secret, and its compromise exposes the whole fleet's credentials.", "A store outage stops every run, including the one meant to fix the outage."],
    v: "Reference a test secret in code, run a node, and confirm the file contains the value, then confirm the repository, plan logs and report contain only the path, never the value.",
    dep: ["secret-delivery", "node-identity"]
  },
  "encrypted-data-files": {
    s: "Stores secrets in the repository in encrypted form, decrypted only at compile or run time by holders of the right key, so secrets are versioned and reviewed like other data.",
    d: "Values or whole files are encrypted with keys for specific recipients, such as the server or a set of nodes, and committed. Decryption happens where the key is held. Operators can edit with a tool that decrypts, edits and re-encrypts. This keeps secrets in the same history as code with no extra service. It is hard because encrypted files make diffs unreadable, removing a recipient does not revoke past copies in history, and key distribution to operators and nodes needs its own process.",
    k: ["Encrypted files in the repository vs an external secret manager: files are simple and versioned together; a manager gives access logs, rotation and revocation.", "Encrypt values only vs whole files: values keep structure reviewable; whole files hide key names too."],
    p: ["A departed engineer still holds a key that can decrypt every historical version of the secrets.", "A plaintext copy is committed once by mistake, and remains in history after the encrypted version is added."],
    v: "Add an encrypted value, decrypt it on the server with its key, and confirm a clone of the repository without the key sees only ciphertext and the node still receives the plain value.",
    dep: ["secret-delivery", "secret-redaction"]
  },
  "secret-delivery": {
    s: "Moves a secret from where it is held to the node that needs it, over an authenticated, encrypted channel, to a protected location with tight file permissions.",
    d: "The plan contains the secret, or an instruction to fetch it, for resources that need it: a certificate private key, a database password in a config file. The channel is the authenticated node connection. The provider writes it with restrictive owner and mode, avoiding temporary files that others can read. Delivery should send only what a node is entitled to. It is hard because secrets are written to disk on the node, may be echoed in logs or diffs, and are copied into plans cached on the server.",
    k: ["Secrets embedded in the plan vs fetched by the node: embedded is simple but caches secrets in plans; fetching keeps them out of the plan at the cost of another call.", "Files on disk vs in memory only: files are what most software expects; memory-only is safer and unsupported by most programs."],
    p: ["A secret file is created with default permissions, and is briefly world-readable before the mode is set.", "A cached plan on the server holds every node's secrets in plaintext."],
    v: "Deliver a test secret to a node and confirm the file has the specified owner and mode from the moment it exists, and that nodes outside the group receive nothing.",
    dep: ["mutual-tls-channel", "file-provider", "node-identity"]
  },
  "secret-rotation": {
    s: "Replaces secrets on a schedule or after exposure, updating the store, every consumer and the dependent services, in an order that avoids an outage.",
    d: "Rotation changes a value at its source, such as a database password, and updates each node's copy and any service that must reload it. Done manually it is rare and error-prone; done through the configuration system it is a data change followed by a rollout. Safe rotation often runs two valid credentials at once: add the new one, converge the fleet, then retire the old one. The hard part is knowing every place a secret is used, because forgotten copies break only when the old value is finally revoked.",
    k: ["Dual-credential overlap vs a single cutover: overlap avoids downtime but needs the target to accept two credentials; cutover is simple and risks a gap.", "Frequent automated rotation vs rotation only on exposure: frequent rotation limits exposure windows and proves the process works; rare rotation is cheaper and untested when needed."],
    p: ["A secret is revoked before one forgotten consumer has the new value, and that service fails in production.", "Rotation is practiced only during an incident, when it fails for the first time."],
    v: "Rotate a test credential, converge the group, confirm every node holds the new value and the dependent service reconnects, then revoke the old one and confirm no authentication failures follow.",
    dep: ["secret-delivery", "batched-rollouts", "secret-store-integration"]
  },
  "secret-redaction": {
    s: "Keeps secret values out of logs, reports, diffs, error messages and exported data by marking them sensitive and masking them wherever output is produced.",
    d: "Values retrieved as secrets carry a sensitive flag that follows them through templates and attributes. Output layers replace flagged values with a placeholder, and diff output shows that a secret changed without showing either value. Reports compare hashes rather than contents. It is hard because the flag is easy to lose: a template that concatenates a secret into a larger string produces unflagged output, and many error messages include whatever value caused the error.",
    k: ["Taint tracking of values vs pattern-based scrubbing: tracking is precise but lost by string operations; scrubbing catches anything but misses unrecognized formats.", "Hide changes entirely vs show that a change occurred: hiding is safest; showing a change lets operators know the secret was updated."],
    p: ["A debug log level prints full resource attributes, including a password, to a log shipped widely.", "Interpolating a secret into a longer string drops its sensitive mark and exposes it in the report."],
    v: "Change a secret-bearing file on a test node and read the run report, the server log and the diff output, confirming none contain the secret and each says only that it changed.",
    dep: ["resource-abstraction"]
  },
  "node-identity": {
    s: "A cryptographic identity, such as a certificate and key, unique to each node, which proves who is asking for a plan and decides what data and secrets it may receive.",
    d: "At enrollment the node generates a key and obtains a certificate or token bound to its name. Every later request is authenticated with it, and the server authorizes by that identity, not by claims in the request. Identity is the base of secret scoping, because a node can receive only data addressed to it. It is hard because the key sits on the machine being managed, so imaging, cloning and rebuilding all risk duplicated or stale identities.",
    k: ["Per-node certificates vs a shared token: certificates give per-node revocation and scoping; a shared token is easy and gives no attribution.", "Name-based identity vs hardware- or cloud-attested identity: names are simple and spoofable at enrollment; attested identity ties to the machine at the cost of integration."],
    p: ["A machine image is cloned with its key included, and several nodes present the same identity.", "Identity is derived from the hostname, so a new machine reusing a name inherits the old one's secrets."],
    v: "Make a request as a test node using its certificate and confirm it receives only its own data, then make the same request with another node's name in the body and confirm it is refused.",
    dep: ["enrollment-and-signing"]
  },
  "enrollment-and-signing": {
    s: "The first-contact process in which a new node requests an identity and the server, or an operator, approves and signs it before the node may receive any plan.",
    d: "The node generates a key and sends a signing request. The server signs it automatically under a policy, such as a pre-shared token or a cloud attestation, or leaves it for manual approval. Automatic signing allows autoscaled fleets to join without people. The danger is that signing is the moment of trust: a permissive policy lets any machine on the network obtain an identity and read configuration data, so the policy must be narrow, and the signing authority is itself a high-value target.",
    k: ["Automatic signing vs manual approval: automatic scales with autoscaling; manual is safer and does not scale.", "Pre-shared enrollment token vs attestation from the platform: a token is simple but can leak; attestation is stronger and depends on the platform."],
    p: ["Autosigning accepts any request matching a name pattern, and an attacker on the network enrolls a machine named like a database server.", "The signing authority's key is stored on the same server that holds all the data."],
    v: "Submit an enrollment request with a wrong token and confirm it is refused and logged, then submit one with a valid token and confirm the node receives a certificate scoped to its own name only.",
    dep: ["mutual-tls-channel"]
  }
});
