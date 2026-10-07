// Details for the dependency scanner plate, part 3: version semantics, reachability, licenses, inventory.
ATLAS.details("dependency-scanner", {
  "ecosystem-version-parsers": {
    s: "One parser and comparator per ecosystem's version scheme, producing a structured version that can be ordered correctly against any other of the same kind.",
    d: "Version schemes differ: dotted numbers with optional pre-release tags, date-based versions, schemes with epochs and revisions, and free-form strings with their own comparison rules. Each parser splits a string into components and implements the ecosystem's ordering exactly as its package manager does. The comparators are the foundation of range evaluation and must agree with the real tool. Hard because the rules are idiosyncratic and sometimes underspecified, and invalid versions exist in the wild and must be ordered somehow rather than crashing.",
    k: ["Per-ecosystem comparators vs one universal scheme: per-ecosystem is exact but is more code; a universal scheme is simpler and wrong in the corners.", "Reject malformed versions vs order them best-effort: rejecting is safe but drops components, best-effort keeps coverage with uncertain answers."],
    p: ["Comparing versions as text makes ten sort before two and flips verdicts for any component beyond nine.", "A comparator that differs from the real package manager gives wrong results that only appear for odd versions."],
    v: "Run a conformance table of version pairs per ecosystem, taken from the package manager's own test cases, and confirm every comparison matches, including malformed and very long version strings.",
    dep: ["version-normalization"]
  },
  "range-grammars": {
    s: "Parsers for the many ways ecosystems write version ranges: operators, wildcards, hyphen ranges, unions and exclusions, converted into one internal interval form.",
    d: "Manifests state ranges such as at least this and below that, a compatible-release operator, a caret or tilde shorthand, a wildcard, or a bracketed interval. Advisories have their own forms. Each grammar is parsed to a list of intervals over the comparator's ordered versions. Range parsing matters for resolution, upgrade planning and when only a range, not a lockfile version, is known. Hard because shorthand operators have ecosystem-specific rules, particularly for zero-leading versions, and malformed ranges appear in real manifests.",
    k: ["Convert to common intervals vs evaluate natively: a common form simplifies matching, while native evaluation avoids conversion bugs.", "Strict parse errors vs lenient parsing: strict flags bad manifests, lenient scans more projects and can misread intent."],
    p: ["Treating a compatible-release shorthand as a simple lower bound allows versions the project would never install.", "A wildcard parsed as an exact string never matches, so the component is reported as unaffected."],
    v: "Parse a set of ranges per grammar and confirm each yields the expected intervals and accepts and rejects the versions listed in a published test table, including zero-leading and wildcard cases.",
    dep: ["ecosystem-version-parsers"]
  },
  "prerelease-ordering": {
    s: "Applies the rules for where pre-release, release-candidate, development and post-release versions fall relative to final releases, which differ between ecosystems.",
    d: "A version labeled as a release candidate normally sorts before its final release; a post-release or patch-suffixed version sorts after. Pre-release identifiers compare field by field, numerically when numeric and lexically otherwise, and some schemes ignore them in ranges unless requested. This ordering determines whether a pre-release of a fixed version counts as fixed. It is hard because the rules conflict across ecosystems and advisories rarely say which pre-releases are affected, so verdicts depend on convention.",
    k: ["Treat pre-releases of the fixed version as fixed vs affected: affected is cautious, while fixed matches the maintainers' ordering but may trust unfinished code.", "Include pre-releases in ranges by default vs exclude: including finds more, but most ranges were not written with them in mind."],
    p: ["Ordering a release candidate after the final release marks a patched version as vulnerable or the reverse.", "Dropping the pre-release tag while parsing makes a candidate equal to the release it precedes."],
    v: "Evaluate a fixed-in-1.2.0 advisory against 1.2.0-rc1, 1.2.0 and 1.2.0-post1 and confirm the verdicts match the ecosystem's documented ordering, with the rule cited in the explanation.",
    dep: ["ecosystem-version-parsers", "range-evaluation"]
  },
  "epoch-and-revision": {
    s: "Handles version schemes that add an epoch to override ordering and a packaging revision for rebuilds, as used by operating-system packages.",
    d: "An epoch is a leading integer that takes precedence over everything after it, used when upstream changes its numbering. A revision records distribution-specific rebuilds of the same upstream version, often carrying security patches. Comparison goes epoch first, then upstream version, then revision, each with its own character-class comparison algorithm. It is required to match system packages correctly, because the fix is frequently only visible in the revision. Hard because the algorithm is intricate, and omitting an epoch in an advisory implies zero rather than unknown.",
    k: ["Implement the packaging tool's exact algorithm vs approximate with dotted-number logic: exact is required for correctness; approximation fails on tilde and letter handling.", "Default a missing epoch to zero vs treat it as unknown: zero matches the tools, but can misjudge a source that left it out by mistake."],
    p: ["Ignoring the epoch makes an older package with a high epoch compare as lower than a newer one.", "Stripping the revision removes the very information that shows a security patch was applied."],
    v: "Compare version pairs that differ only by epoch, revision or a tilde suffix against the packaging tool's own comparison output and confirm every result agrees.",
    dep: ["ecosystem-version-parsers", "version-normalization"]
  },
  "version-normalization": {
    s: "Converts equivalent version spellings into one canonical form, such as removing leading prefixes and padding, so matching and storage treat them as the same version.",
    d: "Real data contains a leading letter prefix, build metadata after a plus sign, extra trailing zeros, different separator characters and ecosystem-specific aliases for the same release. Normalization strips what does not affect ordering, preserves what does and records the original string for display. It is applied both to advisory data and to inventory versions so lookups agree. Hard because over-normalizing merges distinct versions, and under-normalizing makes identical versions fail to match.",
    k: ["Normalize on ingestion and keep the original vs normalize at query time: ingestion is fast, but query-time normalization is easier to fix retroactively.", "Ignore build metadata in ordering vs keep it: ignoring follows most specifications, but some ecosystems use it to distinguish rebuilds."],
    p: ["Stripping a prefix from one side only makes the same version look different and misses the advisory.", "Collapsing trailing zeros in a scheme where they matter equates two distinct releases."],
    v: "Feed ten spellings of one version through ingestion and inventory and confirm they normalize to one value that matches an advisory, while two genuinely different versions stay distinct.",
    dep: []
  },
  "import-level-analysis": {
    s: "Checks whether the application imports or loads the vulnerable package at all, the coarsest and cheapest form of reachability.",
    d: "The analyzer scans source and build configuration for import statements, dynamic loads and dependency declarations used by code, then maps them to packages. A transitive package that nothing imports directly may still be loaded by its parent, so the check follows the dependency graph. It filters findings in packages that are installed but never loaded, cheaply and with few false negatives. Hard because loading can be dynamic, through plugins and configuration, and because an import of the package says nothing about calling the vulnerable function.",
    k: ["Import-level only vs function-level analysis: import-level is fast and conservative, while function-level removes more noise at a much higher cost.", "Follow only static imports vs also dynamic loads: static is predictable, dynamic loads close a gap but need heuristics."],
    p: ["A package loaded only by string name through configuration looks unused and is dismissed.", "Counting any import as reachable keeps nearly every finding, so the filter does little."],
    v: "Scan a project with one vulnerable package imported and another installed but never loaded, and confirm the first is marked loaded and the second marked not imported, each with the evidence.",
    dep: ["dependency-graph", "build-time-capture"]
  },
  "call-graph-builder": {
    s: "Constructs a graph of which functions call which others across the application and its dependencies, the data structure that reachability queries run over.",
    d: "The builder parses source or compiled code, resolves calls to their targets, and links functions across package boundaries using the dependency graph and import resolution. Output is a directed graph with function nodes and call edges, sometimes with conditions. It can be built from source, from bytecode or from binary metadata. It is the most expensive component in the plate: large applications produce huge graphs, and precision is limited by how well calls through interfaces, callbacks and reflection can be resolved.",
    k: ["Over-approximate vs under-approximate calls: over-approximation never misses a path but keeps false reachable findings; under-approximation misses real paths.", "Whole-program graph vs per-package summaries: whole-program is precise but slow, summaries are reusable across scans and less exact."],
    p: ["An under-approximated graph marks a reachable vulnerability not reachable, producing a dangerous false sense of safety.", "Building the graph for every scan from scratch makes the analysis too slow to use in pull requests."],
    v: "Build the graph for a fixture with a known call chain into a vulnerable function, and confirm the chain appears as edges, including a cross-package hop, and a function never called has no inbound edge.",
    dep: ["dependency-graph", "manifest-parsers", "build-time-capture"]
  },
  "entry-point-discovery": {
    s: "Identifies where execution can begin or untrusted input can enter, such as main functions, request handlers, message consumers and exported library functions.",
    d: "Reachability needs a starting set. The discoverer finds entry points from framework conventions, route tables, annotations, configuration files, exported symbols and process definitions. For a library the entry points are its public API, since callers can reach any of it. A path from an entry point to the flawed function is what makes a finding reachable. Hard because entry points are often declared by frameworks in ways static analysis cannot see, so missed entry points shrink the graph and produce false negatives.",
    k: ["Framework-aware detection vs generic main-only: awareness finds handlers and listeners that matter, but needs maintained knowledge of each framework.", "Treat all public API of a library as entry points vs only documented use: all public is safe, documented use is closer to real usage."],
    p: ["Missing handlers registered through configuration leaves vulnerable code in the unreachable set.", "Using only the main function for a service that runs request handlers marks everything behind them unreachable."],
    v: "Scan a fixture service with a handler registered only through configuration, and confirm that handler is listed as an entry point and a vulnerable call beneath it is reachable.",
    dep: ["call-graph-builder", "manifest-parsers"]
  },
  "symbol-level-advisory-data": {
    s: "Advisory data that names the specific functions, classes or modules containing the flaw, the input to function-level reachability.",
    d: "Most advisories say only that a package version is affected. Symbol-level data adds the vulnerable functions, derived by researchers or automatically by analyzing the fixing change and extracting which functions it modified. The scanner stores the symbols with the advisory and maps them into the call graph's naming. It is what lets reachability say called or not called. Hard because the data is sparse, symbols are renamed across versions, derived data can include unrelated functions touched by the fix, and naming differs between source and compiled forms.",
    k: ["Derive symbols from fix commits automatically vs curate by hand: automation scales, but pulls in incidental changes; curation is accurate but covers few advisories.", "Treat missing symbols as reachable vs unknown: reachable is safe, unknown is honest and lets policy decide."],
    p: ["Derived symbols that include a refactored helper make nearly every project appear reachable.", "Treating no symbol data as not vulnerable would suppress most advisories."],
    v: "For an advisory with symbol data, confirm the stored symbols match the functions changed by the fix, and that a version of the package where a symbol was renamed still resolves to the same entry.",
    dep: ["advisory-normalization", "advisory-index"]
  },
  "static-reachability-query": {
    s: "Asks the call graph whether any path exists from an entry point to a vulnerable symbol and returns reachable, not reachable or unknown, with the path as evidence.",
    d: "For each finding with symbol data, the query searches the graph from the discovered entry points to the vulnerable nodes. A found path is returned as evidence a developer can inspect. When no path exists the finding is demoted, and when symbol data or graph coverage is missing the answer is unknown. Results are cached per graph and symbol. It is the headline benefit of the whole analysis and the most mistrusted: users want to verify the path, and an unknown result must not be rendered as safe.",
    k: ["Three-valued result vs a boolean: three values are honest about coverage, but give policy more cases to handle.", "Show the path vs show only the verdict: the path allows verification and builds trust, but takes space and review time."],
    p: ["Collapsing unknown into not reachable removes findings the analysis could not actually judge.", "A cached result is not invalidated when the call graph changes, serving a stale verdict."],
    v: "Query a vulnerable function with a known path and confirm reachable with the path listed; query one with no path and confirm not reachable; query one lacking symbol data and confirm unknown.",
    dep: ["call-graph-builder", "entry-point-discovery", "symbol-level-advisory-data"]
  },
  "dispatch-and-reflection": {
    s: "Handles calls whose target is chosen at runtime, through interfaces, function pointers, callbacks, dynamic loading and reflection, which static call graphs cannot resolve directly.",
    d: "Resolvers use type information to find the possible implementers of an interface, treat callbacks as edges to every function of a matching signature, and model well-known reflective patterns. Where resolution is impossible, they either add conservative edges or mark the region as opaque. It decides how far the analysis can be trusted in modern frameworks that wire everything through dependency injection and configuration. Hard because precision and recall pull against each other: conservative edges connect everything to everything, while ignoring them hides real paths.",
    k: ["Conservative edges for unresolved calls vs mark as unknown: conservative keeps soundness but inflates reachability; unknown preserves precision of what is known.", "Hand-written models of frameworks vs generic analysis: models are accurate for covered frameworks and need ongoing updates."],
    p: ["Ignoring reflective calls makes code reached only through a plugin loader look dead.", "Over-conservative edges make every function reachable and the analysis useless for noise reduction."],
    v: "Analyze a fixture where the vulnerable function is reached only through an interface implemented in another package, and confirm the path is found; then through a reflective call and confirm the finding is marked unknown, not safe.",
    dep: ["call-graph-builder"]
  },
  "dynamic-runtime-evidence": {
    s: "Uses observations from running software, such as loaded libraries and executed functions, to confirm that vulnerable code is actually used in production.",
    d: "Instrumentation or profiling records which packages are loaded and which functions run, sometimes only for a sampled fraction of traffic, and reports them to the platform. Evidence of execution overrides static doubt, while long periods without execution provide supporting, never conclusive, evidence that code is unused. It catches dynamic behavior static analysis cannot. Hard because the cost and risk of instrumenting production are real, rare code paths run only occasionally, and the data covers only the traffic that happened to occur.",
    k: ["Runtime evidence as confirmation only vs also as a basis to dismiss: confirmation is safe, but dismissal on absence misses rarely used code paths.", "Always-on lightweight tracking vs on-demand sampling: always-on gives coverage, sampling limits overhead."],
    p: ["Concluding unused from a quiet week misses a monthly batch job that calls the vulnerable function.", "Instrumentation overhead in a hot path causes latency problems that lead to it being disabled."],
    v: "Run a service that calls the vulnerable function once during a test and confirm the platform marks the finding as executed with a timestamp, while a package that is only loaded is marked loaded but not executed.",
    dep: ["runtime-inventory", "static-reachability-query"]
  },
  "license-detection": {
    s: "Determines the license of each component from declared metadata, license files and source headers, reporting the evidence and a confidence.",
    d: "Detectors read the license field of a package's metadata, match license text files against a library of known texts, and scan source headers for notices. Results are merged by precedence, and conflicts, such as metadata saying one license and the file saying another, are flagged. The output feeds policy and notices. It is hard because declarations are free-form or missing, licenses are modified, files contain several licenses, and dual-licensed packages leave the user a choice that must be recorded.",
    k: ["Trust declared metadata vs scan file contents: metadata is cheap and structured but often wrong; scanning is accurate and needs the source and time.", "Fuzzy text matching vs exact: fuzzy handles reformatting and variants, but can mislabel a modified or custom license."],
    p: ["A package declaring a permissive license in metadata while shipping a restrictive license file is treated as safe.", "No license found is read as public domain instead of all rights reserved."],
    v: "Scan packages with consistent, conflicting and absent license data and confirm each is reported with its evidence, with the conflict and the missing case flagged for review rather than defaulted.",
    dep: ["component-identity", "registry-client", "dependency-graph"]
  },
  "spdx-expression-parsing": {
    s: "Parses compound license expressions with and, or and exception operators into a structure that policy can evaluate precisely.",
    d: "A package can state its license as a combination, such as one license or another at the user's option, or a license with an exception. The parser follows the standard grammar for identifiers, operators, parentheses and exceptions, maps deprecated or alternative spellings to canonical identifiers, and handles custom references. The evaluator then determines whether the expression satisfies a policy, since for an or-expression one satisfiable branch is enough. Hard because real data contains invalid syntax and nonstandard names.",
    k: ["Strict grammar vs tolerant parsing of bad expressions: strict is unambiguous, tolerant keeps coverage but may read the operator wrong.", "Pick the most permissive branch of an or-expression vs ask: picking is automatic, but the choice becomes a legal decision the tool made silently."],
    p: ["Reading an or-expression as and demands both licenses and flags a compliant package as a violation.", "Dropping the exception clause treats a license with an exception as the stricter base license."],
    v: "Evaluate a table of expressions including parentheses, exceptions and deprecated identifiers against a policy and confirm each result matches the expected truth table, with invalid expressions reported.",
    dep: ["license-detection"]
  },
  "license-policy": {
    s: "Rules stating which licenses are allowed, restricted or forbidden for which kinds of use, evaluated against the inventory like any other finding.",
    d: "A policy lists licenses by category, such as permissive, weak copyleft, strong copyleft and network copyleft, and states what is allowed in each context: distributed product, internal tool or hosted service. Evaluation produces findings with the component, license and rule. Approvals and exceptions follow the same lifecycle as vulnerability exceptions. It makes legal constraints enforceable in the pipeline. Hard because applicability depends on how software is used and linked, which the scanner cannot fully see, so policy often flags for human review.",
    k: ["Allowlist of licenses vs denylist: an allowlist is safe by default but blocks new licenses until reviewed; a denylist passes unknown ones.", "Context-specific rules vs one rule everywhere: context is accurate to how software is used, but requires project metadata to be right."],
    p: ["A denylist-only policy lets a custom or unknown license pass unreviewed.", "Applying a hosted-service rule to a distributed product, or the reverse, blocks the wrong things."],
    v: "Scan a project containing one allowed, one restricted and one unrecognized license and confirm results are pass, review-required and review-required respectively, each citing the rule.",
    dep: ["license-detection", "spdx-expression-parsing", "exceptions-and-waivers", "policy-language"]
  },
  "copyleft-propagation": {
    s: "Reasons about whether a copyleft license on a dependency imposes obligations on the software that uses it, based on how the dependency is linked, modified and distributed.",
    d: "The analyzer takes the graph, each component's license category and the way it is combined into the product: statically linked, dynamically linked, separate process, modified or unmodified, distributed or hosted. It outputs obligations and potential conflicts between licenses, such as two incompatible licenses combined into one work. It is advisory, not a legal conclusion. Hard because the interpretation of linking and derivative work varies and is partly unsettled, so the output should be a prompt for review with facts attached, not a verdict.",
    k: ["Conservative flagging vs precise conclusions: conservative finds all risks and generates review load, precision requires legal judgment the tool lacks.", "Model linking from build data vs ask the owner: build data is automatic but incomplete; asking is accurate and slow."],
    p: ["Presenting a heuristic result as a legal conclusion exposes the organization to false assurance.", "Ignoring transitive dependencies misses a copyleft component that is pulled in several levels down."],
    v: "Scan a fixture where a copyleft library is statically linked into a distributed product and confirm an obligation finding with the path and link type, and that the same library in a separate process is rated lower.",
    dep: ["license-detection", "dependency-graph", "build-time-capture"]
  },
  "attribution-notices": {
    s: "Generates the notice files that many licenses require, listing each included component, its license text and copyright holders, for shipping with the product.",
    d: "The generator walks the shipped dependency set, collects copyright statements and license texts from each component, deduplicates identical texts, and emits a notice document in the form the license requires, such as a text file or an about page. It can be regenerated at every release so it matches what actually ships. It turns a recurring manual task into a build artifact. Hard because requirements differ per license, copyright lines are scattered, and the notice must match the shipped set, not the full development graph.",
    k: ["Generate at build time vs maintain by hand: generation stays accurate with every release, but needs reliable component data.", "Include only shipped components vs the full graph: shipped is correct for obligations, but depends on correct scope detection."],
    p: ["A notice generated from the manifest instead of the built artifact omits components bundled at build time.", "Missing copyright lines because they live only in source headers that the generator did not read."],
    v: "Build a release, generate the notice, and confirm it lists every component in the shipped artifact exactly once with its license text, and does not list development-only tools.",
    dep: ["license-detection", "sbom-generator", "dev-vs-runtime-scoping"]
  },
  "dependency-graph": {
    s: "The scanner's central data structure: components as nodes and dependency relationships as edges, with versions, scopes and the paths that explain why each is present.",
    d: "Built from lockfiles, resolution or image contents, the graph records every direct and transitive component, the version actually chosen, the declared constraint on each edge and metadata such as scope and source. It answers why is this here, who depends on this, and what changes if this is upgraded. Matching, reachability, license analysis and upgrade planning all read it. Hard because graphs are large, contain cycles and multiple versions of one package, and must stay accurate when only part of the source is available.",
    k: ["Resolved graph only vs graph with declared constraints: resolved is exactly what ships, while constraints are needed to plan upgrades.", "One node per package vs per package version: per version is accurate for multi-version trees, but grows the graph."],
    p: ["Collapsing multiple versions of one package into one node hides a vulnerable copy under a patched one.", "A graph built from manifests rather than the lockfile reports versions that will never be installed."],
    v: "Build the graph for a fixture with a diamond dependency and two versions of one package, and confirm both versions appear as separate nodes, each with the full path of parents explaining its presence.",
    dep: ["lockfile-parsers", "transitive-resolution", "component-identity"]
  },
  "component-identity": {
    s: "A canonical way to name each component so that the same thing is recognized across scans, sources and documents: ecosystem, name, version and distinguishing qualifiers.",
    d: "Identity is expressed as a package URL, optionally with checksums, source repository and qualifiers such as architecture or distribution. It is the join key between inventory, advisories, bills of materials, exceptions and statements. Good identity is stable, unique and derivable from the data on hand, with hashes added when names are not trusted. Hard because names collide across registries, packages are copied under other names, and files with no package metadata have no name at all, only a content hash.",
    k: ["Name and version identity vs content hash identity: names are readable and match advisories, while hashes are tamper-evident but cannot be matched to advisories directly.", "Include qualifiers in the identity vs keep them separate: including them is exact, but multiplies identities across platforms."],
    p: ["Two registries with a package of the same name produce the same identity and share advisories they should not.", "An identity without a source qualifier cannot distinguish a registry package from a locally modified copy."],
    v: "Generate identities for the same package from a lockfile, an image and a bill of materials and confirm all three produce the same identifier and join to the same advisory.",
    dep: ["version-normalization"]
  },
  "sbom-generator": {
    s: "Produces a software bill of materials from the scanner's inventory: a standard-format list of components, versions, licenses, hashes and relationships for a build or image.",
    d: "The generator reads the dependency graph and component metadata and serializes it into a standard format, adding the producing tool, the subject artifact's digest, a timestamp and relationships such as depends-on and contained-in. It can run on source, on the build, or on the final artifact. Customers and regulators ask for it, and other tools consume it. Hard because completeness depends on where it is generated: source misses what the build adds, and artifact scans miss scope and intent, so each generation point states its limits.",
    k: ["Generate at build time vs from the finished artifact: build time knows scope and intent, while artifact scanning reflects what really ships.", "Include everything vs only shipped components: everything is a fuller record, but inflates the list with tools."],
    p: ["An SBOM generated from source omits components bundled during the build, giving customers an incomplete picture.", "No digest of the described artifact leaves the document unattached to anything checkable."],
    v: "Generate a bill of materials for a built image, validate it against the format's schema, and confirm that every package a separate image scan finds appears in it and the document names the image digest.",
    dep: ["dependency-graph", "sbom-formats", "component-identity", "language-packages-in-layers"]
  },
  "sbom-formats": {
    s: "The standard serializations for bills of materials, with their different data models, which the scanner must read and write without losing meaning.",
    d: "Two main open formats exist, each with a schema, a set of component types, relationship vocabulary and optional extensions for licenses, vulnerabilities and attestations. They differ in how they model relationships, files and license expressions, so conversion between them can lose or distort information. The scanner implements readers, writers and validators and pins the versions it supports. Hard because producers interpret the specifications differently and many documents are only partly valid, so strictness decisions affect interoperability.",
    k: ["Support one format deeply vs several: one is simpler and consistent, while supporting several is required to work with customers' tools.", "Strict validation vs tolerant reading: strict catches bad producers, tolerant ingests more real documents."],
    p: ["Converting between formats silently drops relationships or license detail not representable in the target.", "Pinning an old specification version leaves newer documents unreadable."],
    v: "Round-trip an inventory through each supported format and confirm the component set, versions, licenses and relationships are identical after parsing, and that an invalid document is rejected with the failing field.",
    dep: ["component-identity"]
  },
  "sbom-ingestion": {
    s: "Accepts bills of materials produced elsewhere, such as by a supplier or build system, and scans them as if they were a local inventory.",
    d: "The ingester validates and parses the document, maps its component entries to canonical identities, rebuilds the graph from the relationships and runs the normal matching and policy steps. It allows scanning of software the organization cannot open, such as vendor products, and of artifacts whose build is somewhere else. The result is only as good as the document. Hard because supplied documents have missing versions, ambiguous names and no hashes, and a malicious or erroneous supplier can omit components entirely.",
    k: ["Trust the supplied document vs verify against the artifact: trusting is cheap, verification finds omissions but needs the artifact.", "Reject incomplete entries vs ingest with warnings: rejecting is strict, ingestion with warnings preserves what can be learned."],
    p: ["A document that omits a vulnerable component yields a clean scan of software that is not clean.", "Components without versions match every advisory or none, depending on a default nobody chose deliberately."],
    v: "Ingest a supplier document with one component missing a version and one with a known advisory, and confirm the advisory is reported and the unversioned component is flagged as unassessable.",
    dep: ["sbom-formats", "component-identity", "match-engine"]
  },
  "vendored-code-detection": {
    s: "Finds third-party code copied directly into a repository or bundled into a file, which has no manifest entry and so is invisible to ordinary dependency scanning.",
    d: "Detectors compare file hashes, partial fingerprints and distinctive code snippets against an index of known open-source components and releases, and read embedded version strings and headers. A match produces a component identity with a confidence. It covers copied libraries, minified bundles and statically linked code. Hard because copies are modified, trimmed and renamed, so exact hashes fail, while fuzzy fingerprinting is expensive, has false positives and requires a large indexed corpus.",
    k: ["Exact file hashes vs fuzzy fingerprints: hashes are fast and certain but break on any change; fuzzy finds modified copies and sometimes finds the wrong one.", "Scan all files vs known vendor directories: all files is complete but slow, directories are quick and miss odd places."],
    p: ["A locally patched copy of a library does not match any hash and is never reported.", "A fuzzy match to the wrong release version gives a wrong set of advisories."],
    v: "Copy a known library release into a test repository without a manifest, then confirm the scanner identifies it with a version and confidence, and that a one-line modification to the copy is still detected as that library.",
    dep: ["component-identity", "package-identity-matching"]
  },
});
