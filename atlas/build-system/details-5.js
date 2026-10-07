// Details for the build system plate, part 5: platforms, toolchains and configurations.
ATLAS.details("build-system", {
  "platforms": {
    s: "Named descriptions of a machine environment, as a set of constraints such as processor family, operating system and libraries, used for both the host that builds and the target that runs.",
    d: "A platform is a collection of values along constraint dimensions. A build distinguishes the host (where the tools run), the execution platform (where actions run, possibly remote) and the target platform (where the output will run). Targets and toolchains declare which constraints they need or support, and the system compares these against the chosen platforms. It is hard because the three roles collapse into one on a laptop but separate in cross-compilation and remote execution, and because constraints have to be modeled finely enough to select the right toolchain without becoming an unmanageable taxonomy.",
    k: ["Separate host, execution and target platforms vs a single platform: correct cross-compilation and remote builds, but more concepts that simple builds do not need.", "Constraint sets vs opaque platform names: composable and extensible, but matching rules get complex."],
    p: ["Tools built for the target platform instead of the host fail to run during the build.", "A platform missing one constraint matches a toolchain meant for a different environment and produces wrong output."],
    v: "Select a different target platform and confirm toolchain resolution picks the matching compiler, and that build tools themselves still use the host platform. Query the chosen platforms for one target.",
    dep: ["toolchain-resolution", "build-flags"]
  },
  "toolchain-definitions": {
    s: "Declarations that package a compiler, linker and related tools together with the constraints on where they run and what they can target.",
    d: "A toolchain is a target that returns a provider describing tool paths, default flags, supported features and sysroots, plus metadata stating the execution and target constraints it satisfies. Rules ask for a toolchain by type, not by name, and receive the resolved one. Toolchains are themselves built or fetched, so their digests become part of action keys. It is hard because a toolchain is the largest single input to most actions, and a hermetic one must include every library and header the tools reach for, not just the compiler binary.",
    k: ["A toolchain built or fetched by the workspace vs the host's installed tools: reproducible across machines, but heavy to download and maintain versus tools that may differ per host.", "A small set of common toolchains vs one per project: fewer variants and better cache sharing, but harder to evolve."],
    p: ["A toolchain that quietly uses system headers changes behavior when the machine's packages update.", "A toolchain update invalidates every cached action at once, with no way to stage it."],
    v: "Pin a toolchain by digest and build on two machines with different system packages. Confirm identical output digests and that a toolchain digest change reruns all affected compile actions.",
    dep: ["platforms", "fetch-rules", "providers"]
  },
  "toolchain-resolution": {
    s: "Picks, for each target that needs a kind of tool, the toolchain whose constraints match the chosen execution and target platforms.",
    d: "A rule declares the toolchain types it needs. During analysis, the engine takes the available toolchains registered for each type, filters by whether their constraints are satisfied by the current execution and target platforms, and takes the first match in registration order. The execution platform is chosen jointly so that all required toolchains can run together. Failures list the candidates and what each lacked. It is hard because the choice participates in configuration, so an unmatched or ambiguous toolchain appears as a cryptic analysis error, and because registration order silently decides ties.",
    k: ["First match by registration order vs explicit priorities: simple and predictable, but a new registration earlier in the list can change what every target uses.", "Resolving toolchains per target vs per build: mixed environments within one build, but resolution cost and cache keys multiply."],
    p: ["A new toolchain registered ahead of the default silently changes compilers for unrelated targets.", "Resolution error messages that omit rejected candidates make a missing constraint look like a missing file."],
    v: "Register two toolchains for one type with different constraints and build for each platform. Confirm the event stream reports which toolchain each target used, and remove a constraint to see the resolution error list.",
    dep: ["platforms", "toolchain-definitions", "analysis-phase"]
  },
  "build-configuration": {
    s: "The combination of options, such as optimization level, target platform and feature flags, under which a target is analyzed. The same target in two configurations is two different graph nodes.",
    d: "A configuration is an immutable record of option values. Every target node is identified by its label plus its configuration, so debug and release builds, or host tools and target code, coexist in one graph without sharing actions. Dependencies inherit the parent's configuration unless a transition changes it. The configuration's identity enters output paths and cache keys. It is hard because every option potentially splits the graph: adding a flag that does not matter to most targets still makes them differ, doubling work and cache entries.",
    k: ["A fine-grained configuration containing only relevant options vs a whole-command-line record: less duplication and more sharing, but each rule must declare which options it reads.", "Per-target configurations vs one global configuration: flexible mixes such as host tools next to target code, but analysis and caches grow."],
    p: ["An irrelevant flag included in the configuration splits the graph and halves cache hit rates.", "Host tools accidentally built in the target configuration are rebuilt for each cross-compile target."],
    v: "Build in two configurations that differ in one flag read by one rule. Confirm only the targets affected by that flag differ in output paths, and the unaffected ones share cached results.",
    dep: ["build-flags", "output-layout", "config-transitions"]
  },
  "build-flags": {
    s: "User-settable options, from the command line or files, that become part of the configuration: compiler flags, feature switches and custom values defined by rules.",
    d: "Built-in flags cover common choices such as optimization and platform. Rules can define their own typed build settings that users set like other flags and that targets read through attributes. Flags set on the command line, in shared configuration files or by transitions merge by precedence. A flag's value becomes part of the configuration and so of keys for everything that reads it. It is hard because flags are global by nature, so they leak into places that should not care, and because teams use them for both build-level choices and per-target behavior.",
    k: ["User-defined typed settings vs only built-in flags: projects model their own choices in the build, but each setting adds a dimension to the configuration space.", "Flags that affect all targets vs scoped to some: simple, but it is difficult to build one target with an exception."],
    p: ["A debugging flag left in a shared configuration file makes release artifacts differ from what the team thinks it ships.", "Two flags that interact are tested only in their defaults, and the combination fails in production."],
    v: "Set a custom flag on the command line and confirm that only targets reading it get different action keys, and that the effective value and source are reported by the build's configuration listing.",
    dep: ["build-configuration", "command-line-interface"]
  },
  "select-expressions": {
    s: "Attribute values that depend on the active configuration, written as a mapping from conditions (platform, flag value) to alternatives and resolved during analysis.",
    d: "A conditional attribute lists branches keyed by named condition targets and a default. When the target is analyzed in a configuration, the engine finds the branch whose condition matches, and uses that value for sources, dependencies or flags. Unresolved or ambiguous matches are errors. It lets one target declaration serve several platforms. It is hard because the target graph, before analysis, has to include all branches' dependencies, so queries over it over-approximate, and because overlapping conditions cause ambiguity that must be resolved by specificity rules.",
    k: ["Resolving in analysis vs in build files at load: one declaration serves every configuration, but loading cannot know the active configuration and graph queries see all branches.", "Most-specific match vs requiring disjoint conditions: flexible layering of overrides, but a new condition can change an existing target's value."],
    p: ["A missing default branch causes analysis to fail only on a platform nobody tested.", "A conditional dependency that is an unbuildable target on another platform still breaks loading unless guarded."],
    v: "Build a target whose sources differ by platform, once per platform, and confirm the action inputs list only the matching branch's files. Add a platform with no matching branch and confirm a clear error.",
    dep: ["build-configuration", "analysis-phase", "attributes-and-labels"]
  },
  "config-transitions": {
    s: "A function attached to a dependency edge or rule that changes the configuration for the dependency, such as building a tool for the host or an asset for a different platform.",
    d: "A transition takes the current configuration and returns one or more new configurations for the target it applies to. Typical cases: host tools, a binary embedded in another platform's package, or a split that builds a library in several variants side by side. Each result produces separate nodes in the graph. It is hard because transitions multiply the configured graph, can create the same target in many near-identical configurations, and make cache sharing depend on how much of the configuration they reset.",
    k: ["Resetting to a canonical configuration vs deriving from the parent: tools share results across every consumer, but must not depend on parent options.", "Split transitions building every variant vs one chosen variant: complete multi-architecture packages, but multiplied build time."],
    p: ["A transition that sets a flag but leaves others inherited creates a distinct configuration per parent, and tools get rebuilt many times.", "An output built under one transition is accidentally referred to under another and has the wrong platform."],
    v: "Query the configured graph for a tool used by two targets in different configurations. With a canonicalizing transition, one configured node should exist; without it, two should.",
    dep: ["build-configuration", "analysis-phase", "attributes-and-labels"]
  },
  "cross-compilation": {
    s: "Building code on one platform to run on another, which needs a clear split between tools that run during the build and code that is the product.",
    d: "The target platform differs from the execution platform, so compilers, code generators and other tools are built for the execution platform and run there, while libraries and binaries are built for the target. The sysroot supplies target headers and libraries. Rules must mark each dependency as a tool or as target code so transitions apply correctly. It is hard because many projects assume build and target are identical: they run freshly built binaries during the build, probe the host for features, or embed host paths.",
    k: ["Explicit tool vs target dependency kinds: correct splitting and easy cross builds, but every rule and target must be annotated.", "A hermetic sysroot vs host libraries: reproducible results, but heavy to assemble for each target."],
    p: ["A tool accidentally built for the target tries to run on the build machine and fails with an exec format error.", "Feature probing at build time reads the host and bakes wrong capabilities into target code."],
    v: "Build a binary for a different target platform, inspect its header to confirm the target format, and confirm the generators it used were run natively on the build machine.",
    dep: ["platforms", "config-transitions", "toolchain-resolution"]
  },
  "debug-release-variants": {
    s: "Different builds of the same code with different optimization, debug information and checks, produced by changing configuration rather than by editing the targets.",
    d: "A named variant sets a group of flags: optimization level, assertions, symbol generation, sanitizers, link-time optimization. Each variant is a separate configuration with its own outputs and cache entries, so switching between them costs nothing once warm. Variants such as debug, release, release with symbols and instrumented builds are common, and tests are often run in several. It is hard because the matrix of variants, platforms and options grows quickly, and because behavior that differs between variants becomes a source of bugs found only in production.",
    k: ["Variants as configurations vs separate checkouts or build files: one definition and warm caches for each, but disk and cache use grow per variant.", "Few canonical variants vs freely combinable flags: predictable and heavily cached, but teams cannot try arbitrary combinations without leaving the shared caches."],
    p: ["A release-only bug appears because tests run only in the debug variant.", "A variant that differs only in a flag no one reads still creates separate outputs and doubles build time."],
    v: "Build the same target in debug and release, confirm the outputs differ in size and symbols, then switch back and confirm the first variant rebuilds nothing.",
    dep: ["build-configuration", "build-flags", "output-layout"]
  }
});
