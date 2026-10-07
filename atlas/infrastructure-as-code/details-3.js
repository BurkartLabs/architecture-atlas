// Details part 3: variables, outputs, modules; loading and validation.
ATLAS.details("infrastructure-as-code", {
  "input-variables": {
    s: "Declared parameters of a configuration or module, with a type, description, optional default and sensitivity flag, whose values are supplied by the caller at run time.",
    d: "A variable block declares the name, type constraint, default and description. The root module's values come from the command line, files and environment; a child module's come from arguments in the call that instantiates it. Values are converted to the declared type, checked against validation rules and then made available as references. Required variables with no default prompt or fail. The difficulty is interface design: a module with dozens of loosely typed inputs is hard to use, and removing or retyping one breaks every caller.",
    k: ["Many small variables versus one structured object: small inputs are simple to document, while objects group related settings and evolve with optional attributes.", "Defaults in the module versus required inputs: defaults ease adoption, but hide choices that should be made consciously, such as region."],
    p: ["A default that silently picks a production-sized option surprises callers who never set the variable.", "A sensitive variable not flagged as such appears in plan output and logs."],
    v: "Declare a typed variable with no default, run plan without a value in a non-interactive shell, and confirm a clear error naming the variable rather than a prompt or a silent empty value.",
    dep: ["type-system","blocks-and-attributes"]
  },
  "variable-validation": {
    s: "Custom rules attached to an input variable that reject bad values with a clear message before any planning begins.",
    d: "A validation block holds a condition expression over the variable and an error message. It is evaluated when the value is bound, after type conversion, so it can check formats, ranges, allowed sets and relationships within one structured value. Conditions are normally limited to the variable itself. A failing rule stops the run before any remote call. The limits matter: validation sees only that variable and not other inputs or real infrastructure, so cross-field checks need preconditions instead.",
    k: ["Validate at the variable versus validate later in a precondition: early validation fails fast near the cause, while later conditions can use other values.", "Strict rules versus permissive: strict rules prevent mistakes, but over-specific patterns reject legitimate new formats."],
    p: ["A regular expression that rejects valid but uncommon names blocks a deployment until the module is changed.", "Error messages that restate the rule rather than the fix leave callers guessing."],
    v: "Set a value that violates a rule, run validate or plan, and confirm failure occurs before any provider call with the message and variable name, and that a valid value passes.",
    dep: ["input-variables","expression-evaluator"]
  },
  "local-values": {
    s: "Named expressions inside a module, computed once and reused, that name intermediate results and avoid repeating the same complex expression.",
    d: "A locals block assigns names to expressions that may reference variables, resources, data sources and other locals. Locals are not inputs or outputs: they are private to the module and appear in the dependency graph as nodes. They are evaluated when their dependencies are known, so a local that references a resource waits for it. Used well, they document intent; used badly, they become a tangle of indirection. A cycle among locals is an error found when the graph is built.",
    k: ["Name intermediate values versus inline expressions: locals aid reading and reuse, but a long chain forces readers to jump between definitions.", "Compute in locals versus in variables' defaults: locals can use resources and other values, while defaults are limited to constants."],
    p: ["A local that references a resource attribute makes everything using it depend on that resource, which can create unintended ordering.", "Reusing one local name for several purposes in a large module makes edits risky."],
    v: "Define two locals where one references the other and a resource uses the second, then confirm the resulting graph has the resource depending on the same source and plan shows the evaluated value.",
    dep: ["expression-evaluator","implicit-dependencies"]
  },
  "output-values": {
    s: "Named results a module exposes to its caller or to the command line, including values from remote systems that other configurations read from state.",
    d: "An output block names an expression, with optional description and sensitivity flag. In a child module, outputs are the only way to hand values to the parent. In the root module they are printed after apply and stored in state, where other configurations can read them. Outputs become part of the module's public interface: callers depend on their names and types. They may be unknown during planning when derived from attributes assigned at creation, and they take part in the graph like resources.",
    k: ["Expose whole resource objects versus selected attributes: whole objects are convenient, but couple callers to a provider's schema.", "Root outputs for cross-stack sharing versus a separate registry: outputs are simple, but make state a public integration surface."],
    p: ["Removing or renaming an output breaks every module and stack that reads it, often only at the next plan.", "Outputs containing sensitive values are stored in state and readable by anyone with state access."],
    v: "Apply a configuration with an output derived from a created identifier, read it with the output command, then confirm another configuration can read the same value from state.",
    dep: ["expression-evaluator","sensitive-values","state-schema"]
  },
  "sensitive-values": {
    s: "A marking carried by values and variables that causes display to be redacted, with the mark propagating through any expression that uses the value.",
    d: "A variable, output or provider schema attribute can be flagged sensitive. Evaluation tracks the mark: any value derived from a marked value is marked too, and rendering of plans, logs and outputs shows a placeholder. The real value still flows to providers and is stored in state. The mechanism protects against casual exposure, not against reading state. Sensitivity is hard to propagate correctly through every function and collection, and a value passed through a data source, template or provisioner can lose the mark.",
    k: ["Taint-style propagation versus per-attribute flags only: propagation covers derived values, but errs towards over-redaction that hides useful diagnostics.", "Redaction at display versus not holding secrets at all: redaction is easy to add, while ephemeral values avoid persisting secrets entirely."],
    p: ["A sensitive value written to a file or interpolated into a command line is exposed in logs outside the tool's control.", "Marking everything sensitive makes plans unreadable, and reviewers stop trusting what they see."],
    v: "Mark a variable sensitive, use it in a resource attribute, run plan, and confirm the attribute is shown as redacted while state holds the real value and the output of a derived expression is also redacted.",
    dep: ["expression-evaluator","provider-schemas"]
  },
  "module-calls": {
    s: "A block that instantiates another module with arguments for its variables, giving a reusable unit with its own namespace, outputs and lifecycle within the parent configuration.",
    d: "A module call names a source, a version where applicable and values for the child's inputs. The child's resources are addressed under the module path, so the same module can be instantiated several times with different arguments, including with count or for-each. Providers are inherited or passed explicitly. The call forms a node group in the graph: the child's inputs depend on the parent's values and the parent's use of outputs depends on the child. Hard parts are interface stability and the temptation to wrap every resource in a module.",
    k: ["Many thin wrapper modules versus a few purposeful modules: wrappers add layers with no abstraction, while larger modules hide detail callers sometimes need.", "Expanding a module call versus duplicating its contents: expansion shares code, but every instance changes together when the module changes."],
    p: ["Deeply nested modules make resource addresses long and refactors hard to apply to state.", "A module upgraded in place changes resources in every environment that references it at once."],
    v: "Call one module twice with different arguments, confirm state holds two sets of resources under separate module addresses, and that changing one call's argument plans changes only in that instance.",
    dep: ["input-variables","output-values","module-sources","module-provider-passing"]
  },
  "module-sources": {
    s: "The address types a module call can use to locate code: local paths, version control repositories, archives, registries and object storage locations, with optional subdirectory and revision.",
    d: "A source string tells the installer where to fetch the module. Local paths are used as is; remote sources are downloaded into a cache directory during initialization, with address forms for repositories at a branch, tag or commit, for archives and for a registry namespace. A double-slash notation selects a subdirectory. The installer resolves redirects and credentials. It is hard because sources are mutable by default: a branch reference changes under you, and fetching code from the network means running configuration someone else controls.",
    k: ["Pin to commit or tag versus follow a branch: pinned sources are reproducible, but need deliberate updates; branches update silently.", "Registry sources versus direct repository sources: registries add version constraints and discovery, while direct sources need nothing but access to the repository."],
    p: ["A source pointing at a branch lets an upstream push change production infrastructure on the next plan.", "Credentials for private sources missing on a pipeline runner fail initialization with a network-looking error."],
    v: "Pin a module to a tag, initialize, record the fetched commit, then push a new commit to the branch and confirm re-initialization still resolves the same pinned content.",
    dep: ["module-installer"]
  },
  "module-versioning": {
    s: "Version constraints on registry and repository modules, resolved at initialization to a specific release that is recorded so runs are repeatable.",
    d: "Registry module calls carry a constraint such as at least one version and below the next major. The installer lists available releases, picks the newest matching, and downloads it. Unlike providers, module versions are not recorded in a lockfile, so a new matching release can be picked up on re-initialization. Semantic versioning conventions carry the compatibility promise. The difficulty is that a module's change in behavior, such as renaming a resource, may require state moves, and module authors need moved blocks to make upgrades safe.",
    k: ["Exact pins versus range constraints: exact pins prevent surprises, ranges deliver security fixes automatically but can introduce plan changes.", "Major versions for any resource rename versus only for interface changes: a strict rule protects state, while a loose rule makes upgrades quietly destructive."],
    p: ["A minor release that renames internal resources shows up as destroy-and-create for every user of the range.", "Modules not recorded in a lock allow two pipeline runs a day apart to use different code."],
    v: "Constrain a module to a range, initialize, publish a newer matching release, re-initialize, and confirm the newer version is chosen and the plan diff is exactly what the release notes describe.",
    dep: ["module-registry","version-constraint-solver","moved-blocks"]
  },
  "module-registry": {
    s: "A service that publishes modules by namespace, name and version, serves release lists and downloads over a documented protocol, and hosts documentation for them.",
    d: "A registry exposes a discovery document and endpoints to list versions and to return a download location for a given version. Public and private registries use the same protocol, so a client treats them alike. Publishing is usually tied to tagging a repository. A private registry adds access control and enables organizations to share vetted modules. It is difficult to operate because it becomes a supply-chain choke point: a compromised or deleted release affects every consumer, so signing, immutability and mirroring matter.",
    k: ["Public registry versus private registry only: public access gives wide reuse, while private registries add review and control over what runs.", "Immutable releases versus allowing republish: immutability protects reproducibility, but mistakes require a new version rather than a quiet fix."],
    p: ["A deleted release in a registry breaks every pipeline that pinned it, with no local copy to fall back on.", "Modules published without review bring privileged resources into trusted environments."],
    v: "Publish a module version to a registry, resolve it from a clean machine using only the namespace and constraint, and confirm the downloaded content matches the published checksum.",
    dep: ["module-sources","provider-registry"]
  },
  "module-provider-passing": {
    s: "The rules for which provider configurations a module uses: inherited by default, or passed explicitly with aliases so one module can span regions and accounts.",
    d: "Providers are configured in the root module. A child module inherits the default configuration for each provider type unless the call passes a map of named configurations, which supports aliases such as one per region. A module declares the configurations it needs and expects them from its caller. State records the provider configuration address for each resource, so a resource stays tied to the account it was created in. Hard parts are that removing a provider configuration while resources still reference it makes them undeletable.",
    k: ["Modules that configure their own providers versus receive them: self-configured modules are easy to call, but cannot be removed cleanly and break expansion.", "Aliases per region versus separate configurations per region: aliases keep one workspace, while separate roots limit the blast radius of each region."],
    p: ["Deleting a module call that contained a provider block leaves its resources unmanageable, because destroying them needs that provider.", "Forgetting to pass an alias creates resources in the default region silently."],
    v: "Pass two region aliases into a module, apply, and confirm state records each resource under its own provider configuration and the objects exist in the matching regions.",
    dep: ["provider-configuration","module-calls","resource-instance-records"]
  },
  "configuration-loader": {
    s: "The component that finds configuration files in a directory, parses both syntaxes, merges override files, and builds the tree of modules the rest of the engine consumes.",
    d: "The loader reads every configuration file in a directory, native and JSON, plus override files that replace matching blocks. It parses into bodies, decodes top-level block types, checks for duplicate names and records source locations for diagnostics. For module calls it asks the installer for the manifest of installed modules and recursively loads each. The result is an immutable configuration tree. The difficulty is that only structure is known at this stage: attribute contents are decoded later against schemas.",
    k: ["Load all files in a directory versus an explicit manifest: directory loading is convention over configuration, but file naming and accidental files change behavior.", "Parse only the structure first versus decode fully at once: staged decoding allows tooling to load partial configuration, but spreads errors across phases."],
    p: ["A backup or editor temporary file with a matching extension is loaded as configuration and creates duplicates.", "An override file silently replaces one block and surprises people who read only the original."],
    v: "Place a duplicate resource name in two files of one directory and confirm the loader reports both locations in a single diagnostic before any provider is started.",
    dep: ["blocks-and-attributes","json-syntax","module-installer"]
  },
  "module-installer": {
    s: "The initialization step that downloads modules and providers into a local data directory and records a manifest of what was installed and from where.",
    d: "Initialization walks the module tree, fetches each remote module from its source into a cache, writes a manifest mapping module calls to directories, then resolves provider requirements into a set of versions, downloads them and verifies checksums against the lockfile. It also configures the backend. It can be rerun safely. Hard parts are partial failure, because a half-populated directory misleads later commands, and the amount of network access and code from third parties this step performs.",
    k: ["Install everything at initialization versus lazily at first use: eager installation fails early and works offline afterward, but makes every fresh checkout slow.", "Verify checksums always versus trust the cache: verification stops tampered packages, but breaks on platforms not in the lockfile."],
    p: ["An interrupted initialization leaves a manifest that points to modules not fully fetched, so later commands fail oddly.", "Running initialization with upgrade flags in a pipeline changes provider versions without review."],
    v: "Initialize a clean checkout, confirm the manifest lists each module with its source, version and directory, and confirm every provider archive hash matches the lockfile.",
    dep: ["module-sources","dependency-lockfile","provider-registry","backend-abstraction"]
  },
  "variable-assignment": {
    s: "The ordered sources that supply values for root variables: defaults, environment, variable files, automatic files and command-line flags, with a fixed precedence.",
    d: "Root variable values come from several places: declared defaults, environment variables with a fixed prefix, a conventional variables file, files named with an automatic pattern, files given explicitly and individual flags. Later sources override earlier ones in a documented order. The binder converts each raw string to the declared type, then runs validation. Values from files are typed; values from environment variables are text and need conversion. Difficulty is traceability: when a value surprises, there is no single place to look.",
    k: ["Many sources versus one file: many sources suit pipelines and layered environments, but make the effective value hard to determine.", "Files committed to the repository versus injected values: committed files give reviewable environments, while injected values keep secrets out of version control."],
    p: ["A conventional variables file left in a directory silently overrides defaults that the author thought were in effect.", "Secrets placed in a committed variables file are in history forever."],
    v: "Set one variable in the environment, a file and a flag with different values, run plan, and confirm the flag wins and the plan reflects it, in the documented precedence order.",
    dep: ["input-variables","type-system"]
  },
  "schema-decoding": {
    s: "Decoding of block bodies against the schemas supplied by the core and by providers, turning untyped syntax into typed values and reporting unknown or missing arguments.",
    d: "A provider returns a schema for each resource, data source and its own configuration: attributes with types and flags for required, optional, computed and sensitive, plus nested blocks with cardinality. The decoder applies the schema to each body, evaluates expressions and converts values to the declared types. Unknown attributes and missing required ones produce diagnostics at the source location. The hard part is that schemas come from running plugins, so even syntax validation needs providers installed and started.",
    k: ["Validate against provider schemas versus parse only: schema checks catch typos before any remote call, but require every provider to be installed and runnable.", "Computed attributes distinct from optional ones: the distinction lets the plan know which values come from the remote side, at the cost of a more complex schema."],
    p: ["Validation in a pipeline without provider installation cannot check resource arguments, so typos pass an earlier stage.", "A provider upgrade that adds a required argument breaks existing configuration at decode time."],
    v: "Misspell an argument name in a resource block and confirm validation reports an unsupported argument with file, line and the expected names, without calling any remote API.",
    dep: ["provider-schemas","blocks-and-attributes","type-system"]
  },
  "static-validation": {
    s: "A check that proves the configuration is internally consistent, with correct references, types and schemas, without reading state or contacting any remote system.",
    d: "Validate loads the configuration, starts providers only to fetch schemas and to run their offline validation calls, then walks the graph with placeholder values for anything unknown. It reports undefined references, type mismatches, invalid arguments and cycles. It needs no credentials and no state, so it runs early in a pipeline. It cannot detect problems that depend on real values, such as a name already in use, which only the plan or apply reveals.",
    k: ["Offline validation versus checking against real accounts: offline checks are fast and safe for every commit, but miss conflicts and permission errors.", "Strict failure on warnings versus only errors: failing on deprecation warnings drives upgrades, but breaks builds on third-party modules."],
    p: ["A passing validation is read as proof that apply will succeed, when it only proves syntax and types.", "Validation with providers uninstalled reports less than the full check, without saying so."],
    v: "Reference an undefined variable and a mis-typed value in one file and confirm validate reports both in one run, exiting nonzero, with no network traffic and no state read.",
    dep: ["schema-decoding","graph-builder","cycle-detection"]
  },
  "dependency-lockfile": {
    s: "A committed file recording the exact provider versions and checksums selected for each platform, so every machine installs the same binaries.",
    d: "After constraints are resolved, initialization writes each provider's source address, chosen version, original constraint and a set of package hashes. Later runs reuse these choices and fail if the downloaded package does not match a recorded hash. An upgrade flag re-resolves. Hashes cover several platforms if recorded explicitly, so teams on mixed machines include them all. It is hard because hashes are per platform and per download origin, which creates failures that look like tampering but are only a missing platform entry.",
    k: ["Commit the lockfile versus ignore it: committing gives repeatable installs and review of upgrades, but requires someone to own updates.", "Record hashes for all platforms versus only the current one: all platforms keep pipelines working everywhere, while current-only is quicker but breaks other machines."],
    p: ["A lockfile generated on a developer laptop lacks the pipeline's platform hash and fails installation there.", "A lockfile ignored by version control lets a new provider release change behavior unreviewed."],
    v: "Initialize, commit the lockfile, then on a different platform initialize again and confirm it installs the same versions or fails with a hash message that names the missing platform.",
    dep: ["version-constraint-solver","provider-registry","provider-versions"]
  },
  "version-constraint-solver": {
    s: "The resolver that combines version constraints from the root and all modules, and picks the newest provider release satisfying every one of them.",
    d: "Each module declares required providers with a source and a constraint. The resolver merges constraints for each provider across the whole tree, intersects them and queries the registry for the available versions, filtering by protocol compatibility with the core. It selects the newest version that satisfies all, unless the lockfile already holds a valid choice. If the sets do not intersect, it reports which modules disagree. Unlike a general package solver there is one version per provider per run, so conflicts cannot be resolved by installing two.",
    k: ["One version per provider versus multiple versions side by side: one version keeps state and schemas simple, but module authors' constraints can conflict.", "Newest satisfying versus oldest satisfying: newest picks up fixes, while oldest gives stability and exposes too-loose lower bounds."],
    p: ["A module with an upper bound on a provider blocks the whole configuration from upgrading until the module is updated.", "Prerelease versions are excluded by default, so a constraint expecting one finds nothing."],
    v: "Give two modules constraints that overlap on one version and one that do not, and confirm the first resolves to that version while the second fails naming both modules and constraints.",
    dep: ["provider-registry","provider-versions","protocol-handshake"]
  },
});
