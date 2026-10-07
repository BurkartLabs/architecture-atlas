// Details part 6: provider plugin protocol; provider surface.
ATLAS.details("infrastructure-as-code", {
  "plugin-rpc-protocol": {
    s: "The versioned remote-procedure-call interface between the core and each provider process, defining the calls, message types and encoding for schemas, planning, applying and reading.",
    d: "The core is the client and each provider a server on a local socket. Messages are typed and serialized in a compact binary format, with dynamic values carried in a self-describing encoding because resource types are unknown to the core. The interface has calls to fetch the schema, validate, configure, read, plan, apply, import, upgrade state and invoke functions. Protocol versions are numbered and extended compatibly. It is hard because the dynamic value encoding must represent unknowns, sensitivity marks and null, and every change must work with old providers.",
    k: ["A generic dynamic-value protocol versus generated types per resource: generic values let one core serve every provider, but move type checking to run time.", "Few coarse calls versus many fine calls: coarse calls reduce round trips, but make each provider implement large operations."],
    p: ["A provider built against a newer protocol version than the core supports is rejected at startup with an error that blames versions.", "Large values over the channel exceed message limits for resources with very large attributes."],
    v: "Start a provider process directly, call the schema method with a protocol client and confirm the response lists resource types, then configure and read a known object and compare with the core's results.",
    dep: ["process-isolation","protocol-handshake","provider-schemas"]
  },
  "process-isolation": {
    s: "Each provider runs as its own operating system process, so a crash, memory leak or dependency conflict inside a provider cannot take down the core or other providers.",
    d: "The core starts one process per provider configuration, so two aliases of one provider are two processes, and communicates over a local channel. Providers are separate binaries with their own libraries. If a process dies, the core gets a connection error and fails only the operations that used it. Credentials passed in configuration live in that process's memory. Isolation also allows providers to be written independently and versioned separately. The cost is process startup time, memory per process and the need to stop processes reliably at exit.",
    k: ["Separate processes versus loading providers as libraries: processes isolate failures and dependencies, but cost startup time and memory.", "One process per configuration versus one per type: per-configuration processes keep credentials separate, while per-type processes use less memory."],
    p: ["Hundreds of provider aliases start hundreds of processes and exhaust memory on small runners.", "A provider process left running after an interrupted run holds credentials and ports until killed."],
    v: "Kill one provider process during a multi-provider apply and confirm only that provider's resources fail with a connection error, while objects of other providers complete and are recorded.",
    dep: ["plugin-launcher","plugin-rpc-protocol"]
  },
  "protocol-handshake": {
    s: "The startup exchange in which the core and a provider agree on a protocol version and a transport, and confirm each speaks a compatible interface.",
    d: "A provider executable that is run directly prints a message explaining it is a plugin. When launched by the core, it receives environment values containing a magic cookie, then prints a single line announcing the protocol version, network address and encoding. The core checks that it supports that version and connects. The cookie prevents accidental starts and the version lets the core refuse incompatible plugins with a clear message. It is hard to evolve, since old cores and new providers need a long overlap.",
    k: ["Single-line handshake on output versus a separate negotiation call: a startup line is simple and cheap, while a call allows richer capability exchange.", "Strict version equality versus a supported range: ranges let one provider serve several cores, but multiply testing."],
    p: ["Debug output written to standard output before the handshake line corrupts it, and the core reports a startup failure.", "A provider compiled for a newer protocol is silently excluded from version resolution until constraints are widened."],
    v: "Launch a provider with the expected environment and confirm exactly one handshake line with the version appears first, then launch without the cookie and confirm it exits with an explanatory message.",
    dep: ["plugin-launcher","plugin-rpc-protocol"]
  },
  "plugin-launcher": {
    s: "The part of the core that locates installed provider binaries, starts their processes, completes the handshake, passes credentials, and shuts them down at the end of the run.",
    d: "Given a provider's source address and the locked version, the launcher finds the binary in the installed directory, starts it with a minimal environment, reads the handshake and opens the connection. It reuses a process per provider configuration for the length of the run and stops them all when the walk finishes or on an interrupt. Logs from the provider are captured and forwarded at a configured level. Failures here include missing binaries, wrong platform, execution blocked by endpoint security and handshake timeouts, all of which look similar to users.",
    k: ["Start providers lazily versus all up front: lazy startup avoids unused processes, while eager startup surfaces failures before any change.", "Pass credentials by environment versus through the configure call: environment is the provider's convention, while configure keeps them in the protocol and logged less."],
    p: ["Endpoint security software that quarantines a provider binary produces a generic startup failure.", "A signal that interrupts the core without shutting down providers leaves them running and holding locks on remote objects."],
    v: "Run an apply with a wrapper that logs process starts, and confirm one process per provider configuration starts, each completes the handshake, and none remain after the run ends or is interrupted.",
    dep: ["dependency-lockfile","protocol-handshake","process-isolation"]
  },
  "provider-lifecycle-calls": {
    s: "The set of calls the core makes on a provider for each object: validate, plan, apply, read, import and upgrade, which together implement create, update, delete and refresh.",
    d: "For a resource the core calls validate with the configuration, plan with prior and proposed values, then apply with prior, planned and configured values, which returns the new state. Read refreshes one object, and import finds an object by identifier. Deleting is an apply with a null planned value. Data sources have validate and read only. Every call carries dynamic values with the schema's types. Providers must be idempotent and tolerate retries, and their results must stay consistent with what they planned. That consistency rule is the main source of provider bugs.",
    k: ["Plan and apply as separate calls versus one combined call: separate calls allow the core to show and check the plan, but need providers to compute the same result twice.", "Delete expressed as apply with null versus a dedicated call: one call keeps the interface small, while a dedicated call would be clearer."],
    p: ["A provider that computes different values in plan and apply trips consistency errors that look like core bugs.", "A read that fails transiently is interpreted as deletion by a provider that treats any error as not found."],
    v: "Drive a test provider through plan, apply and read for one resource with logging on, and confirm the call sequence, the planned and returned values and that state matches the final read.",
    dep: ["plugin-rpc-protocol","provider-schemas","provider-sdk"]
  },
  "provider-sdk": {
    s: "A library that provider authors use to define schemas and implement lifecycle calls without writing protocol handling, with helpers for validation, diffing, retries and testing.",
    d: "The SDK serves the protocol, so authors declare resources as schemas plus create, read, update and delete functions. It handles type conversion, computed and optional attribute logic, plan modification, validators, timeouts and acceptance tests that run against a real service. Newer frameworks give a typed model for plans and states and richer plan modifiers. Because most providers are built from it, SDK behavior defines how thousands of resources diff. It is hard to evolve: its quirks, such as treating zero values as unset, are relied on by existing providers.",
    k: ["Framework with schema-driven defaults versus hand-written protocol handling: a framework gives consistent behavior and less code, but inherits its limitations.", "Typed plan modifiers versus a single custom-diff hook: typed modifiers are composable and testable, while a custom hook can express anything but is easy to get wrong."],
    p: ["Zero values indistinguishable from unset attributes mean a legitimate zero or empty string is dropped or reverted.", "Acceptance tests that create real objects are skipped in routine runs, so regressions appear only at release."],
    v: "Build a provider with one resource using the SDK, run its acceptance test against a real service or fake, and confirm create, update and import steps pass and a follow-up plan is empty.",
    dep: ["plugin-rpc-protocol","provider-schemas","provider-lifecycle-calls"]
  },
  "provider-schemas": {
    s: "Machine-readable descriptions of every resource, data source and configuration block a provider offers, with attribute types, required or computed flags and nested block rules.",
    d: "On startup the core asks each provider for its schema. Each object type has a version number and a block describing attributes, with type, whether required, optional or computed, sensitivity, deprecation and descriptions, plus nested blocks with minimum and maximum counts. The core uses it to decode configuration, validate, plan, render and generate documentation. Schemas can be large, in the tens of megabytes for big providers, which affects startup time. They are hard to evolve: every change must keep existing configuration and state valid.",
    k: ["Self-describing schemas from the running provider versus static schema files: self-describing schemas cannot drift from code, but require starting the process for any tooling.", "Computed attributes distinct from optional: the distinction lets the plan mark unknowns correctly, at the price of subtle author errors."],
    p: ["A new required attribute in a minor release breaks existing configuration at the next plan.", "Large schemas make validation in a pipeline slow, because every provider must start to describe itself."],
    v: "Export the schema as JSON, confirm a known resource lists its attributes with required and computed flags and a version number, and that a nested block has its cardinality recorded.",
    dep: ["plugin-rpc-protocol","type-system"]
  },
  "provider-versions": {
    s: "The version numbers by which provider releases are identified, constrained and locked, with compatibility promises around schemas, state and protocol.",
    d: "Providers follow semantic versioning: patch for fixes, minor for additions and major for breaking changes. A release declares which protocol versions it supports. Configuration states constraints; the lockfile records the one chosen. Upgrading may change schemas, defaults and diffs, so a new minor can still alter plans. Major upgrades commonly require configuration edits and state upgrades. The challenge is that the promise is social and uneven across providers, and state written by a newer version may be unreadable by an older one.",
    k: ["Allow minor upgrades automatically versus pin exact: automatic minors bring fixes and new features, but can change plans without notice.", "Upgrade all providers together versus one at a time: together is fewer runs, while one at a time isolates which provider caused a change."],
    p: ["State written by a newer provider cannot be read after rolling the provider back, blocking an emergency downgrade.", "A minor release changes a default and every plan afterward shows a diff nobody made."],
    v: "Pin an older provider version, apply, upgrade within the constraint, plan, and confirm the plan differences are exactly those listed in release notes, then confirm the lockfile shows the new version.",
    dep: ["provider-registry","protocol-handshake","schema-upgraders"]
  },
  "provider-configuration": {
    s: "The block that sets a provider's arguments such as region, endpoint and account, with aliases for several configurations of the same provider in one run.",
    d: "A provider block holds arguments defined by the provider's schema, evaluated before the provider starts and sent in a configure call. Aliases let one configuration have several, selected per resource or passed to modules. Arguments usually come from variables or the environment. Configuration may depend on other resources, but only on values known at plan time, otherwise resources of that provider cannot be planned. The hard parts are the restriction on unknown values and that the provider configuration is recorded in state with each object.",
    k: ["One provider block per account and region versus a single one parametrized: separate blocks make targets explicit, while parametrized blocks can't vary within one run.", "Configure from other resources' outputs versus from inputs: resource-derived values enable bootstrapping, but break planning when unknown."],
    p: ["A provider configured from a value created in the same run cannot be started during plan on a first apply.", "A missing alias on a resource creates it in the default account instead of the intended one."],
    v: "Define two aliased configurations for different regions, assign a resource to each, apply, and confirm each object exists in its own region and state records the matching configuration address.",
    dep: ["provider-schemas","credential-resolution","unknown-values"]
  },
  "credential-resolution": {
    s: "The sequence of sources a provider tries to find credentials: explicit arguments, environment variables, shared files, workload identity and instance metadata, in a fixed order.",
    d: "Most providers accept credentials as arguments but prefer to find them in the environment. A common chain checks explicit values, then environment variables, then credential files, then federated tokens from the pipeline and finally metadata services of the host. Short-lived tokens are exchanged for temporary credentials, often by assuming a role. The chain's order and silent fallthrough are the hazard: a missing variable can lead the provider to use a different identity than intended, with the wrong permissions or in the wrong account.",
    k: ["Short-lived federated credentials versus stored long-lived keys: federation removes secrets to leak, but depends on an identity setup in each pipeline.", "Silent fallback through the chain versus fail on missing: fallback is convenient on laptops, but can act as the wrong identity in automation."],
    p: ["A pipeline missing its token falls back to the runner's host identity and applies with broader permissions than intended.", "Credentials hardcoded in the provider block end up in state and plan files."],
    v: "Unset the explicit variable and run apply in a sandbox, then inspect the identity returned by the provider's own caller-identity data source and confirm which chain step was used.",
    dep: ["provider-configuration","data-sources"]
  },
  "data-sources": {
    s: "Read-only lookups of existing objects that return attributes for use in configuration, evaluated during planning when their inputs are known.",
    d: "A data block names a type and filter arguments. The engine calls the provider's read and makes the result available as references. If all arguments are known, the read happens during planning, so the plan reflects the current world. If an argument depends on an unknown, or the data source depends on a changing resource, the read is deferred to apply and its result is unknown in the plan. Data sources are stored in state only transiently. They are hard because they can fail or change between plan and apply, and they run with the plan's credentials.",
    k: ["Read at plan time versus defer to apply: plan-time reads give an accurate plan, but add API calls and fail early on missing objects.", "Look up by filters versus reference a created resource directly: lookups decouple configurations, while direct references give real dependencies and ordering."],
    p: ["A data source that matches different objects over time, such as the latest image, changes plans without any code change.", "A lookup of an object created in the same run fails at plan time because it does not exist yet."],
    v: "Use a data source to read an existing object by name, plan, and confirm its attributes appear known in the plan; then make its argument depend on an unknown and confirm it becomes known after apply.",
    dep: ["provider-lifecycle-calls","unknown-values","provider-configuration"]
  },
  "ephemeral-resources": {
    s: "Values fetched or created for the duration of one run and never written to state or plan files, intended for secrets and short-lived connections.",
    d: "An ephemeral resource has open and close operations and optional renew. Its attributes can be used only where they will not be persisted: provider configuration, other ephemeral values and write-only arguments of resources. The tool opens it during the run, uses the value, and closes it at the end, so a secret is read from a vault and given to a resource without being recorded. The restriction is the point and the difficulty: ordinary arguments cannot take ephemeral values, so resources need write-only attributes that providers must support.",
    k: ["Ephemeral values versus ordinary sensitive values: ephemeral values never persist, but only work in places providers have prepared.", "Open at plan and again at apply versus keep one handle: reopening avoids stale values, but doubles external calls and may return different secrets."],
    p: ["A provider without write-only arguments cannot accept an ephemeral value, so authors fall back to storing the secret in state.", "An ephemeral secret that rotates between plan and apply produces a different value than the one reviewed."],
    v: "Fetch a secret via an ephemeral resource, pass it to a write-only argument, apply, then search state and plan file for the secret value and confirm it is absent.",
    dep: ["provider-schemas","secrets-in-state","provider-configuration"]
  },
  "provider-functions": {
    s: "Functions defined and implemented by providers, called from expressions with a provider-scoped name, extending the fixed built-in library with domain-specific operations.",
    d: "A provider's schema lists functions with parameters, a return type and documentation. A call in configuration names the provider and the function, and the core sends the arguments over the protocol and uses the result. Functions are pure and deterministic and run during evaluation, so they can be used in plans. They let providers offer parsing and conversion helpers for their own formats, such as splitting a resource identifier. Each call is a round trip to a process, and a function from a provider that is not installed cannot be evaluated.",
    k: ["Provider-defined functions versus module code: provider functions are tested and typed, while module code needs no provider update.", "Pure functions only versus allowing side effects: purity keeps plans repeatable and safe to evaluate, but rules out lookups."],
    p: ["A function used in configuration requires the provider to start even for validation, adding startup cost.", "A function whose result changes between provider versions silently changes plans."],
    v: "Call a provider function with a known input in a local value, run plan, and confirm the evaluated output equals the documented result and the function was invoked over the protocol once.",
    dep: ["plugin-rpc-protocol","provider-schemas","built-in-functions"]
  },
  "schema-upgraders": {
    s: "Provider code that migrates stored state from an older resource schema version to the current one when a provider release changes an attribute's shape.",
    d: "Each resource schema has a version integer saved in state next to every instance. When a provider release increments it, the core calls the upgrade method with the stored raw value and the old version, and the provider returns a value in the new shape. Upgrades chain through intermediate versions. They run before refresh and plan, in memory, and are persisted at the next write. The hard part is permanence: upgraders must be kept forever to read old state, and a bug corrupts stored records.",
    k: ["Upgrade state on read versus a one-time migration command: on-read upgrades are invisible to users, but must be kept indefinitely.", "Keep chains through every version versus allow only the latest to upgrade: full chains support any old state, while limited upgrade windows reduce provider code."],
    p: ["A schema change shipped without an upgrader makes existing state unreadable and the plan fails on every instance.", "An upgrader that drops an attribute silently loses data that the next apply cannot recover."],
    v: "Write state with an old provider version, upgrade the provider, run plan, and confirm the state is read, the schema version in the upgraded state is higher, and the plan shows no spurious changes.",
    dep: ["provider-schemas","provider-versions","state-upgrade"]
  },
  "provider-registry": {
    s: "A service that lists provider versions by source address and serves signed, per-platform packages with checksums, from public or private origins.",
    d: "A source address names a hostname, a namespace and a provider type. The registry's protocol returns available versions with the protocol versions each supports, and for a given version and platform a download link, checksum, signing key and signature. The installer verifies the signature and checksum before use. Organizations run private registries or mirrors for internal providers. It is a supply-chain boundary: provider code runs with the user's credentials, so trust in the publisher and in the signature is what protects every run.",
    k: ["Signed packages with verified keys versus checksums only: signatures prove the publisher, while checksums only detect corruption.", "Public registry by default versus an allowlist of sources: defaults make adoption easy, but allowlists prevent untrusted providers from running with production credentials."],
    p: ["A typo in a provider's source address installs a similarly named provider from a different namespace.", "A registry outage blocks initialization everywhere unless a mirror is configured."],
    v: "Resolve a provider through the registry, confirm the response lists platform packages with checksums and a signature, then corrupt the download and confirm installation fails verification.",
    dep: ["provider-versions"]
  },
});
