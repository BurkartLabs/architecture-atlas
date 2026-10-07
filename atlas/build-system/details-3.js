// Details for the build system plate, part 3: targets, rules, macros and external dependencies.
ATLAS.details("build-system", {
  "targets": {
    s: "A named, addressable node declared in a build file: an instance of a rule with specific attributes, such as one library, one binary or one test.",
    d: "A target has a label made of the workspace, package path and name, a rule kind, and attribute values naming sources, dependencies and options. Targets are what users ask to build and what other targets depend on. Declaring one creates no files; it only records an instance that analysis will later turn into actions. It is hard to choose their granularity: fine-grained targets give precise incremental builds and cache reuse but multiply declarations and graph size, while coarse targets rebuild too much when one file changes.",
    k: ["Fine-grained targets vs coarse ones: smaller rebuilds and better parallelism, but more declarations, more graph nodes and heavier maintenance.", "Source-level targets vs directory-level targets: simple to write, but every change rebuilds the whole directory's dependents."],
    p: ["One giant target for a whole module makes any edit rebuild everything that depends on it.", "Targets that overlap by listing the same source twice produce duplicate outputs or conflicting definitions."],
    v: "Query a target's attributes, then change one source file and confirm only targets whose declared sources include it, and their dependents, are scheduled to rebuild.",
    dep: ["rule-definitions", "attributes-and-labels", "build-files"]
  },
  "rule-definitions": {
    s: "The definition of a kind of target: the attributes it accepts, the providers it returns and the function that creates actions from them.",
    d: "A rule declares a schema of typed attributes (sources, dependencies, flags) and an implementation function. During analysis, the engine calls the function once per target, passing resolved attribute values and the providers of its dependencies. The function returns providers and registers actions, never running commands itself. Rules are written in the build language and shared as modules. It is hard because the implementation sits at the center of build performance and correctness: it decides which inputs each action declares, and a missing one becomes an invisible dependency.",
    k: ["Rules implemented in the build language vs built into the engine: extensible by teams without engine releases, but slower and weaker in what they can express.", "Declaring exact inputs per action vs passing whole directories: precise rebuilds and caching, but more careful work in each rule."],
    p: ["A rule that forgets to declare a header as an input works until the sandbox is enabled, then fails mysteriously.", "A rule that runs a command during analysis makes loading slow and non-cacheable."],
    v: "Write a rule with a deliberately missing input and run it in a sandbox. Confirm the action fails because the file is absent, then add the input and confirm it passes and caches.",
    dep: ["providers", "actions", "attributes-and-labels", "build-language"]
  },
  "attributes-and-labels": {
    s: "The typed parameters of a target, including labels that reference other targets or files, which the system resolves and tracks as dependencies.",
    d: "Attributes have types: string, integer, list, dictionary, file and label. A label value names another target, and the engine turns it into a dependency edge and, during analysis, into that target's providers. Attributes can carry defaults, mandatory flags and allowed rule kinds, and some are marked as executables or as dependencies of a different configuration. It is hard because labels sit at the join of three concerns, namely naming, dependency and visibility, and the way a label is written (relative or absolute, to a file or a rule) has to resolve the same way everywhere.",
    k: ["Typed attributes with validation vs untyped dictionaries: bad values are caught at load time, but rules need more declarations.", "Relative labels vs always absolute: concise inside a package, but moving a package silently changes meaning."],
    p: ["A label that points at a file in another package fails or silently picks a different file after a refactor.", "An attribute accepting any dependency kind lets a target depend on something that cannot produce the needed output."],
    v: "Give a target a dependency label of the wrong rule kind and confirm loading fails with a message naming the attribute and the allowed kinds. Fix it and confirm the edge appears in a query.",
    dep: ["targets", "dependency-declaration"]
  },
  "providers": {
    s: "The structured values a target returns for its dependents to consume, such as output files, include paths or link inputs, passed through analysis instead of through the file system.",
    d: "When a rule's implementation runs, it returns a set of providers keyed by type. Dependents read the providers of their dependencies to decide which files and flags to use. Providers carry both direct data and accumulated sets from the transitive closure, usually as shared immutable structures so that a deep tree does not copy data at each level. It is hard because a provider is an API between rules: changing its shape breaks every rule that reads it, and flattening transitive data eagerly turns a linear graph into quadratic memory.",
    k: ["Nested transitive sets vs flat lists: constant-time merging and shared memory, but consumers must flatten at the end and order semantics need care.", "Fixed provider types vs free-form dictionaries: checked contracts between rules, but more ceremony to evolve them."],
    p: ["A rule flattens its dependencies' include paths into a list per target, and memory grows with the square of the depth.", "A dependency's provider missing a field the rule assumed breaks analysis far from the cause."],
    v: "Add a library whose provider carries a new include path, and confirm a dependent's compile action uses it without being edited. Check analysis memory stays flat when adding a deep chain.",
    dep: ["rule-definitions", "analysis-phase"]
  },
  "macros": {
    s: "Functions in a build file that expand into one or more target declarations, used to cut repetition without writing a new rule.",
    d: "A macro is a call that, at load time, instantiates several targets, for example a library, its tests and a header generator under shared naming conventions. It runs during package loading, so it can only use information available then: its arguments and the language, not the results of building. Macros are cheap to write and the main way teams standardize patterns. They are hard to maintain because the engine sees only the expanded targets, so errors, queries and documentation refer to generated names, and logic that needs analysis results belongs in a rule.",
    k: ["Macros vs rules: macros are simple and need no analysis knowledge, but cannot inspect dependencies or configuration, which a rule can.", "Wrapping existing rules vs defining new ones: easy to adopt, but a deep stack of wrappers hides what is actually built."],
    p: ["A macro that creates many targets per call multiplies the graph size across the repository.", "Generated target names are not searchable in the build file, so engineers cannot find where one is defined."],
    v: "Expand a macro, list the targets it created with a query, and confirm each has the expected attributes. Change a macro argument and confirm only the affected package reloads.",
    dep: ["targets", "build-language", "package-loading"]
  },
  "aspects": {
    s: "Extra analysis attached to a target's dependency graph from outside, so a tool can add actions, such as linting or indexing, to existing targets without editing their rules.",
    d: "An aspect propagates along specified dependency edges and runs an implementation on each target it reaches, seeing that target's attributes and providers. It can register extra actions and return its own providers. Typical uses are static analysis, code indexing, documentation generation and collecting information across a graph. It is hard because an aspect multiplies the action graph by the number of targets it visits, interacts with configuration (each configuration gets its own copy), and must be applied by a command rather than by changing the original definition.",
    k: ["Aspects vs editing every rule: tools can be added without touching other teams' code, but the extra analysis scales with graph size.", "Applying on demand vs always on: no cost to ordinary builds, but results are missing from builds that skip the aspect."],
    p: ["An aspect applied to the whole repository adds analysis time and actions for every target, including generated ones nobody cares about.", "Aspect results differ per configuration, so reports mix incompatible data."],
    v: "Apply a lint aspect to one library and confirm lint actions appear for it and its dependencies, and that the same build without the aspect has none of those actions.",
    dep: ["providers", "action-graph", "analysis-phase"]
  },
  "visibility-rules": {
    s: "Declarations of which packages may depend on a target, enforcing architectural boundaries by failing analysis when an unlisted package refers to it.",
    d: "Each target lists its visibility as public, private to its package, or a set of allowed package patterns. When analysis resolves a dependency edge, it checks that the depending target's package is permitted. Violations are errors at load or analysis time, not run time. Groups of packages can be named and reused. It is hard because visibility is the lever by which a large organization keeps internal code internal, yet it is also bureaucratic: too strict and teams add exceptions everywhere, too loose and the boundaries mean nothing.",
    k: ["Private by default vs public by default: boundaries stay meaningful and are opted into, but every new dependency across packages needs an edit.", "Package-level visibility vs target-level allowlists: simple to read, but a package cannot expose one target to one consumer only without a list."],
    p: ["A wildcard allowlist added to get a change through becomes permanent, and the boundary is gone.", "A refactor that moves a package breaks visibility for every consumer at once."],
    v: "Make one library private, add a dependency on it from another package, and confirm analysis fails naming both. Add the package to the allowlist and confirm it then builds.",
    dep: ["targets", "attributes-and-labels", "analysis-phase"]
  },
  "external-repositories": {
    s: "Code outside the workspace that targets can depend on, such as third-party libraries and shared rule sets, declared by name with a source and a checksum.",
    d: "A workspace file or module declaration names each external repository, how to fetch it (archive, version-control reference, local path) and its expected digest. When a target refers to a label in that repository, the system fetches it on demand, unpacks it into the output area and loads its build files as another package tree. Fetch results are cached by declaration. It is hard because external code needs its own build definitions, often written by the workspace owners, and because fetches run arbitrary code and need network access, unlike ordinary actions.",
    k: ["Pinning by checksum vs by version label: content cannot change silently, but every update requires computing and reviewing a new digest.", "Fetching lazily on demand vs all at start: a build only pays for what it uses, but failures show up mid-build."],
    p: ["A repository declared without a checksum changes upstream and silently alters builds.", "Fetching during a sandboxed or offline build fails because nothing prefetched the repository."],
    v: "Declare an external archive with a checksum, build a target that uses it, and confirm it is fetched once and reused. Corrupt the checksum and confirm the fetch fails loudly.",
    dep: ["fetch-rules", "lockfiles", "download-cache"]
  },
  "fetch-rules": {
    s: "Special rules that run at load time to download, unpack, patch and wrap outside sources into a repository the build can consume.",
    d: "A fetch rule can download a file or archive, verify a digest, extract it, apply patches, and generate build files for code that has none. It may also run limited commands. Because it runs outside the sandboxed action model, its behavior is controlled by the declared digest and by marking whether it is reproducible; reproducible results can be cached by that digest. It is hard because the code has side effects on the file system and network, depends on host tools, and often runs before the build has a hermetic toolchain.",
    k: ["Restricting fetch rules to declared downloads vs allowing arbitrary commands: reproducible and cacheable, but wrapping odd projects needs escape hatches.", "Generating build files automatically vs maintaining them by hand: quick adoption, but the generated files drift from upstream layout."],
    p: ["A fetch rule that invokes the host's compiler or package tool produces different results on each machine.", "A mirror outage fails the build even though all digests are known and cached copies exist elsewhere."],
    v: "Run a fetch for an archive twice. The second should do no download, and the extracted tree's digest should match the declared one; changing the declared digest should force a refetch.",
    dep: ["download-cache", "content-hash-change-detection", "external-repositories"]
  },
  "lockfiles": {
    s: "A recorded, committed resolution of external dependencies to exact versions and digests, so every machine fetches the same set.",
    d: "When dependencies are declared by version ranges, a resolver picks concrete versions and writes them with digests to a lockfile that is committed with the source. Later builds read the lockfile and skip resolution, and a check mode fails if the declared ranges and the lockfile disagree. Updates are explicit commands that change the file in a reviewable diff. It is hard because lockfiles conflict in merges, may contain platform-specific entries, and a stale lockfile gives a build that is reproducible but outdated or insecure.",
    k: ["Committed lockfile vs resolving fresh each build: reproducible and reviewable, but updates are deliberate work and merges can conflict.", "One lockfile for the workspace vs per component: a single consistent set, but any update can ripple across unrelated teams."],
    p: ["A lockfile that is not checked in lets CI resolve newer versions than developers use.", "A lockfile recorded on one platform omits packages another platform needs."],
    v: "Delete the local download cache and rebuild from the lockfile alone. Confirm identical output digests. Edit the declared versions without updating the lockfile and confirm the check fails.",
    dep: ["version-resolution", "external-repositories", "content-hash-change-detection"]
  },
  "version-resolution": {
    s: "Chooses a single version of each external dependency that satisfies every constraint in the graph, and reports conflicts when none exists.",
    d: "Dependencies declare compatible version sets, and the resolver walks the graph to select versions that all agree on, often preferring the highest or the minimal satisfying version. Some systems allow several versions of one dependency side by side; others require exactly one. Output feeds the lockfile. It is hard because resolution is a constraint-solving problem that can be expensive and unintuitive: a small constraint change can move many versions, and a conflict message must explain which parties disagree.",
    k: ["Minimal version selection vs newest compatible: deterministic and stable without a lockfile, but security fixes need explicit upgrades.", "One version per dependency vs allowing duplicates: no diamond conflicts across types, but duplicates bloat output and confuse shared state."],
    p: ["A transitive dependency pulled forward by an unrelated update breaks a consumer who never edited anything.", "Resolution that depends on a network index gives different answers on different days without a lockfile."],
    v: "Declare two dependencies with overlapping constraints on a shared library and confirm one satisfying version is chosen. Make the constraints disjoint and confirm the error names both requirers.",
    dep: ["external-repositories", "lockfiles"]
  },
  "download-cache": {
    s: "A content-addressed local store of downloaded archives and files, shared across workspaces so the network is used once per digest.",
    d: "Before downloading, a fetch rule checks the cache for the declared digest; on a hit it copies or links the file instead. After a download the file is verified and stored under its digest. The cache sits outside any workspace, so many checkouts and CI jobs share it, and an organization may add a read-through mirror. It is hard because it must be safe against partial downloads, concurrent writers and corrupt files, and because its shared location bypasses the isolation the rest of the build tries to maintain.",
    k: ["A shared cache across workspaces vs per-workspace: saves bandwidth and time, but one corrupted entry affects every checkout.", "Verifying the digest on every read vs only at write: catches silent corruption, but costs hashing time on large archives."],
    p: ["An interrupted download left under its final name gets used on the next build and fails to unpack.", "A mirror serving the wrong content under a digest the build does not verify poisons the build."],
    v: "Disconnect from the network and rebuild a target that needs a previously fetched archive. It should succeed from the cache. Corrupt the cached file and confirm the digest check rejects it.",
    dep: ["content-addressable-store", "content-hash-change-detection"]
  },
  "code-generators": {
    s: "Tools run as build actions that produce source files from other inputs, such as interface definitions, templates, grammars and schemas.",
    d: "A generator is declared as a tool target, and a rule runs it as an action with the definition file and options as inputs and the generated sources as outputs. Downstream compile actions take those outputs as ordinary inputs. The generator itself is built from source first, so its version is part of every output's key. It is hard because the set of outputs must often be known before the generator runs, because generator output order and formatting must be deterministic, and because a bug in the generator spreads to every consumer.",
    k: ["Building the generator from source vs using a prebuilt binary: always consistent with the repository, but slower first builds and a bootstrap problem.", "Declaring the exact output list vs a directory of outputs: precise graph edges, but generators whose output names depend on input must be wrapped."],
    p: ["A generator that embeds a timestamp or absolute path makes its output differ on each run and defeats caches.", "Declaring a directory output that the generator also writes extra files to hides undeclared files."],
    v: "Change a definition file and rebuild. Confirm the generator action reruns, the generated sources change, and only their compile actions and dependents rerun; rebuilding unchanged is a full cache hit.",
    dep: ["actions", "generated-sources", "action-key"]
  },
  "generated-sources": {
    s: "Source files that exist only as outputs of actions, never checked in, which the graph treats as inputs to later steps.",
    d: "Generated files live in the output tree and are referred to by label like any source. Anything that consumes them depends on the action that produces them, so ordering is automatic. Tooling that reads the source tree directly, such as editors and indexers, must be told where they are or build first. Whether they are checked in or generated each time is a project decision. It is hard because they blur the line between source and output: stale checked-in copies, generated headers needed before scanning, and names that collide with real files.",
    k: ["Generating at build time vs checking in the output: always fresh and no diff noise, but tools and reviewers must build to see them.", "Generated output visible in the source tree vs only in the output tree: familiar to editors, but risks being edited by hand and overwritten."],
    p: ["A developer edits a generated file in place and the change is lost on the next build.", "Header scanning or an indexer runs before the generator, finds nothing and reports missing includes."],
    v: "Delete the output tree, build, and confirm every generated file is recreated with identical digests. Open an editor on a file that includes a generated header and confirm it resolves.",
    dep: ["code-generators", "output-directory", "header-scanning"]
  }
});
