// Details for the package manager plate, part 2: dependency kinds, resolution, lockfile.
ATLAS.details("package-manager", {
  "runtime-dependencies": {
    s: "Packages the code needs when it runs, installed for every consumer and shipped as part of the dependency closure of anything that depends on this package.",
    d: "Runtime dependencies are listed with constraints and are installed transitively for every user of the package. They form the main edges of the dependency graph the resolver must satisfy. Their ranges are an API promise to consumers: whatever is allowed here can end up in someone else's production. It is hard because each runtime dependency adds attack surface, install time and conflict risk for every downstream project, so a small convenience import becomes a permanent cost.",
    k: ["Few large dependencies versus many small ones: fewer packages are easier to audit, while small ones reduce what each consumer must install and duplicate less code.", "Declaring a dependency versus bundling its code into the package: bundling avoids conflicts and install-time resolution, but hides the code from audit tools and prevents sharing."],
    p: ["A dependency used only in tests is declared as runtime and installed into every production tree.", "A trivial dependency is abandoned or hijacked and breaks every package that transitively relies on it."],
    v: "Install the package alone into an empty project and list the resulting tree; every package present is reachable from its runtime section, and none from its development section appear.",
    dep: ["manifest-file","version-constraints","dependency-graph"]
  },
  "development-dependencies": {
    s: "Packages needed only to work on a project, such as test runners and linters, installed for its own developers but not for the people who depend on it.",
    d: "These are listed in a separate section and installed when the project is the root of an install, but ignored when it is installed as a dependency. Production installs can skip them by flag. They are resolved together with runtime dependencies in the same graph for the root project, so conflicts can arise between the two. It is hard because the line between development and runtime is a human declaration with no verification, and mistakes appear only on the consumer's side as missing modules or oversized installs.",
    k: ["Separate section versus one list with tags: a separate section is simple and widely understood, while tags allow finer groups such as test or docs.", "Resolving development dependencies with runtime ones versus separately: one consistent tree avoids surprises, but a tool upgrade can force a runtime version change."],
    p: ["A runtime import of a package listed only for development passes in the repository and fails in production.", "Development tools that pin an old shared library force the same old version into the application."],
    v: "Install a project as a dependency of another one and confirm none of its development packages are present; install it as the root with the production flag and confirm they are also absent.",
    dep: ["manifest-file","dependency-graph"]
  },
  "optional-dependencies": {
    s: "Dependencies whose installation failure is tolerated: the package still installs and the code is expected to detect their absence and degrade.",
    d: "An optional dependency is attempted like any other, but if it cannot be resolved, built or installed on this platform, the manager records the failure and continues. Some ecosystems extend this to named feature sets that a consumer may switch on. Code must check at runtime whether the dependency loaded. It is hard because the resolver has to decide whether to try, because a silent failure can hide a real problem such as a broken registry, and because lockfiles must record which optionals were actually installed.",
    k: ["Silent skip of failed optionals versus failing loudly: installs succeed on odd platforms, but a genuine fetch error looks identical to an expected one.", "Optional packages versus named feature sets: plain optionals need no new syntax, while features let consumers choose a capability explicitly."],
    p: ["A network failure is treated as platform mismatch and the accelerated code path is never installed.", "A lockfile created on one platform omits the optional packages needed on another."],
    v: "Install a package with an optional dependency that is incompatible with the current platform; the install succeeds, the optional is absent, and the failure is logged with the reason.",
    dep: ["manifest-file","platform-specific-dependencies","lockfile"]
  },
  "peer-dependencies": {
    s: "A declaration that the package expects the host project to provide a compatible copy of another package, so both share one instance instead of each bringing their own.",
    d: "A plugin or framework extension lists the host it works with under a range but does not install its own copy. The installer either installs a copy at the root to satisfy it, warns or fails if the host provides none or a conflicting version. The point is shared identity: two copies of a framework can break state shared through module-level singletons. It is hard because satisfaction depends on the root project, not the plugin, so a resolver must treat peers as constraints on the parent's choices.",
    k: ["Automatically installing peers versus only warning: automatic installs just work, but silently choose versions the project never reviewed.", "Strict peer failure versus advisory warning: strictness prevents broken combinations, but stalls installs over ranges that were harmlessly outdated."],
    p: ["A plugin works against a different copy of the host than the application uses, so registrations never connect.", "A peer range left stale blocks a framework upgrade even though the plugin still works."],
    v: "Install a plugin declaring a peer range into a project with an out-of-range host version; the installer reports the exact mismatch, and after aligning versions the plugin and application load the same host instance.",
    dep: ["dependency-graph","version-constraints","deduplication-strategy","conflict-explanation"]
  },
  "platform-specific-dependencies": {
    s: "Dependencies that apply only on certain operating systems, processor families or runtime versions, selected by conditions in the manifest or on the package itself.",
    d: "A package or dependency carries conditions on operating system, processor family or runtime version, and the installer skips those that do not match the current machine. Packages such as native bindings are often split into one variant per platform with a loader package selecting among them. The lockfile may contain all variants so it works everywhere. It is hard because the resolver must decide whether to include variants not used locally, and because cross-platform CI needs a tree that differs from the developer's.",
    k: ["Locking every platform variant versus only the current one: one lockfile works on all machines, but it records packages no local machine downloads.", "Per-platform packages chosen by condition versus one package with all binaries inside: small downloads, but more names to publish and keep in step."],
    p: ["A lockfile generated on one operating system lacks the variants other developers need.", "A container built for a different processor family receives variants for the build host."],
    v: "Create a lockfile on one operating system, install it on a second one, and confirm the second machine installs its own variant without re-resolving or modifying the lockfile.",
    dep: ["environment-markers","prebuilt-binaries","lockfile","optional-dependencies"]
  },
  "build-dependencies": {
    s: "Packages needed only to compile or generate a package at install or build time, resolved in a separate environment from the one the result runs in.",
    d: "A package that must be built from source declares tools it needs during the build, such as compilers' wrappers, code generators or build backends. They are installed into an isolated, temporary environment, used, then discarded. Their versions need not match the runtime tree. This keeps tooling from polluting application dependencies. It is hard because build dependencies are fetched and executed at install time, often unpinned, so builds change without any change to the package itself.",
    k: ["Isolated build environment versus using the project's own tree: isolation avoids tooling conflicts, but costs extra installs and disk per build.", "Pinned build tools versus latest: pinning reproduces builds later, but old tools stop working with new platforms."],
    p: ["An unpinned build tool releases a breaking version and old package releases stop installing from source.", "Build dependencies are fetched over the network at install time even though the lockfile listed all runtime packages."],
    v: "Build a package from source on a machine with no matching global tools; the build environment is created, the tool versions used are printed, and afterward none remain in the project tree.",
    dep: ["build-isolation","native-builds","manifest-file"]
  },
  "dependency-overrides": {
    s: "Root-project rules that replace the version, or even the source, of a package anywhere in the dependency tree regardless of what its dependents request.",
    d: "An override names a package, optionally with the parent it applies to, and supplies a replacement constraint or location. The resolver applies it before solving, so intermediate packages' own ranges are ignored for that name. It is the escape hatch for emergency security fixes and abandoned packages. It is hard because the override silently breaks promises made by the packages being overridden, applies only at the root so libraries cannot use it, and is easy to forget once the underlying issue is fixed.",
    k: ["Root-only overrides versus overrides honored from dependencies: root-only keeps authority with the application owner, but libraries cannot repair their own subtrees.", "Overriding by range versus by exact version: ranges still let patch updates flow, while exact pins freeze a fix that may become stale."],
    p: ["An override added for a vulnerability stays after the fix ships and pins the project to an old release.", "An override forces a version that violates a dependent's peer range, producing runtime errors the resolver never reports."],
    v: "Add an override for a transitive package, install, and confirm the lockfile shows only the forced version for every path; remove it, reinstall, and confirm the original resolution returns.",
    dep: ["version-constraints","dependency-graph","lockfile-update-policy","backtracking-resolver"]
  },
  "non-registry-sources": {
    s: "Dependencies declared by repository address, archive URL or local path instead of a registry name and version, for unpublished or patched code.",
    d: "The manifest gives a repository with a revision, a tarball URL or a directory path. The fetcher clones or downloads it, builds an archive from it, and the resolver reads its manifest to continue. The lockfile records the exact commit or content hash. These sources are common for forks, unreleased fixes and local development. It is hard because they bypass the registry's immutability, signing and advisory data, and a branch or URL can change content between installs unless pinned.",
    k: ["Pinning to a commit versus a branch or tag: commits are reproducible, while branches track updates but change under every install.", "Allowing non-registry sources in dependencies versus only at the root: libraries stay verifiable by registry, but projects cannot depend on forks through libraries."],
    p: ["A branch reference resolves to a different commit on a colleague's machine because the lockfile did not record the commit.", "A repository dependency with build steps runs arbitrary code at install without any registry vetting."],
    v: "Depend on a repository at a branch, install, and confirm the lockfile contains a full commit hash; move the branch, reinstall from the lockfile, and confirm the original commit is still installed.",
    dep: ["vcs-and-url-fetchers","lockfile-format","integrity-hashes"]
  },
  "dependency-graph": {
    s: "The directed graph of packages and constraints built from manifests, from the root project down through every transitive dependency, which resolution turns into a concrete tree.",
    d: "Nodes are package-and-version candidates, edges are constraints from one release to a package name. The graph is not known upfront: it is discovered by fetching each candidate's metadata as the resolver explores. It may contain cycles, which languages and package formats handle differently. Reachability from the root decides what is installed. It is hard because it is large, lazily discovered and different per environment, so graph size and metadata fetch counts, not computation, dominate resolution time.",
    k: ["Building the whole graph upfront versus discovering lazily: upfront is simple to reason about, but fetches metadata for versions never considered.", "Allowing cycles versus rejecting them: allowing them supports mutually dependent packages, while rejecting simplifies ordering and installation."],
    p: ["A cycle between two packages makes install order undefined and scripts run before their dependencies are ready.", "Metadata for thousands of old versions is fetched for a package that was never going to be chosen."],
    v: "Print the resolved graph for a small project and verify by hand that every edge's constraint is satisfied by the chosen version of its target and that nothing unreachable from the root is present.",
    dep: ["manifest-file","version-constraints","registry-metadata-api"]
  },
  "backtracking-resolver": {
    s: "A resolver that picks a candidate version, checks constraints, and on conflict undoes recent choices and tries alternatives, the simplest complete search over versions.",
    d: "The resolver keeps a stack of decisions. It picks the next unresolved package, tries the newest version that fits, adds its dependencies as new constraints, and continues. On a dead end it pops decisions until an alternative exists. It is complete in principle, so it finds a solution whenever one exists. It is hard because naive chronological backtracking can take exponential time, repeatedly retrying choices unrelated to the conflict, and its error messages merely report the last failure.",
    k: ["Chronological backtracking versus conflict-directed jumping: chronological is easy to implement and debug, but may re-explore huge irrelevant subtrees.", "Newest-first versus oldest-first candidates: newest-first gives current software, while oldest-first finds the minimum versions a project truly needs."],
    p: ["A conflict deep in the graph causes thousands of retries over choices that cannot affect it, making installs appear to hang.", "The final error names only the last package tried, which is rarely the real cause."],
    v: "Construct a graph with a known late conflict and many irrelevant packages; time the resolver and count candidate evaluations, and confirm that a solvable variant returns the same answer on repeated runs.",
    dep: ["dependency-graph","version-constraints","version-selection-heuristics","resolution-metadata-cache"]
  },
  "sat-based-resolver": {
    s: "A resolver that encodes packages, versions and constraints as boolean clauses and hands them to a satisfiability solver, gaining its search speed and optimization ability.",
    d: "Each candidate version becomes a variable. Clauses say at most one version per package, a chosen version implies one of the acceptable versions of each dependency, and declared conflicts exclude pairs. The solver finds an assignment, and an optimization pass prefers newer versions or fewer changes. System package managers use this approach because they have conflicts and alternatives. It is hard because encoding size grows with the number of versions, preferences must be expressed as weights, and failures are reported as unsatisfiable cores that are hard to read.",
    k: ["SAT encoding versus a purpose-built search: a mature solver brings powerful learning and handles conflicts and alternatives, but explanations come back as clause sets.", "Optimizing for newest versions versus fewest changes: newest gives current software, while fewest changes minimizes risk on upgrade."],
    p: ["An unsatisfiable core is shown to users as a list of internal clauses with no mapping back to packages and constraints.", "Encoding every historic version makes the clause set large and slows even trivial installs."],
    v: "Resolve a known unsatisfiable set and confirm the solver reports unsatisfiable, then resolve a satisfiable variant and confirm the answer satisfies each constraint when checked by an independent verifier.",
    dep: ["dependency-graph","version-constraints","virtual-packages-and-provides","version-selection-heuristics"]
  },
  "conflict-driven-resolver": {
    s: "A resolver that learns from every conflict by recording a derived incompatibility, then backjumps directly to the cause, keeping both speed and a record usable for explanation.",
    d: "The resolver tracks terms such as 'package A in range R' and derives new incompatibilities from existing ones by resolution, like clause learning in a solver but over version ranges. When a conflict arises it computes the earliest decision that must change and jumps there. Each derived fact keeps a link to the facts it came from. It is hard because the solver must represent partial ranges exactly, and because correctness depends on subtle set operations over intervals of versions.",
    k: ["Range-level terms versus per-version variables: far fewer facts and compact learning, but interval algebra must be exactly right.", "Retaining derivation history versus discarding after use: history costs memory but is precisely what lets the final error be explained."],
    p: ["An off-by-one error in interval subtraction makes the solver declare a solvable project unsolvable.", "A solver that picks versions poorly, even with learning, still fetches metadata for a huge number of candidates."],
    v: "Resolve a project with a deep conflict and compare against an exhaustive search on small inputs: both agree on solvable or not, and the number of metadata fetches stays far below exhaustive.",
    dep: ["dependency-graph","version-constraints","version-selection-heuristics","resolution-metadata-cache","conflict-explanation"]
  },
  "conflict-explanation": {
    s: "Turns a failed resolution into a short chain of reasons a person can act on, naming the packages and ranges that cannot all hold.",
    d: "When no solution exists, the resolver walks its derivation records backward from the root failure and renders each step as a sentence: this version requires that range, which excludes the other version needed here. Shared sub-conclusions are numbered to avoid repetition. The output ends with a suggestion such as which constraint to relax. It is hard because the minimal explanation is rarely what the search found, because a long chain overwhelms readers, and because a plain 'conflict' without cause sends people to override flags instead of fixing the problem.",
    k: ["A derivation-based explanation versus listing the last failure: derivations show the real chain of cause, but need the resolver to keep its reasoning.", "Showing every step versus summarizing: complete chains are verifiable, while summaries are readable but may omit the one step that matters."],
    p: ["A message names the leaf package that failed rather than the root constraint that caused the incompatibility.", "Users respond to an opaque failure by forcing installs and ending with an unsound tree."],
    v: "Create a project with two dependencies requiring disjoint ranges of a third; the error names all three packages and both ranges, and relaxing exactly one range named in it makes resolution succeed.",
    dep: ["conflict-driven-resolver","backtracking-resolver","version-constraints","dependency-graph"]
  },
  "version-selection-heuristics": {
    s: "Rules for which package to decide next and which version to try first: newest allowed, locked version preferred, fewest candidates first, and exceptions for yanked or pre-release versions.",
    d: "The order of decisions strongly affects speed and result. Resolvers usually decide the package with the fewest remaining candidates first, try the locked version before others during an install, and otherwise try the newest stable one. Yanked and pre-release versions are skipped unless required. Alternate modes prefer the lowest allowed version to test minimum bounds. It is hard because the heuristics that make resolution fast also decide which valid answer you receive, so changing them silently changes what everyone gets.",
    k: ["Prefer the locked version versus prefer the newest: stable reinstalls and small diffs, but security updates never arrive without an explicit upgrade.", "Fewest-candidates-first ordering versus declaration order: much faster failure detection, but the order that resolves becomes harder to predict."],
    p: ["A heuristic change in a new client release picks different versions from the same manifest on two machines.", "Lowest-version mode is never run, so declared lower bounds are wrong and nobody notices."],
    v: "Resolve the same manifest with and without a lockfile and in lowest-version mode; confirm the locked run reproduces the lock exactly, the fresh run picks the newest allowed versions, and the lowest run picks each lower bound.",
    dep: ["version-ordering","yanking-and-deprecation","lockfile","version-constraints"]
  },
  "deduplication-strategy": {
    s: "The policy for whether two dependents that accept different versions of a package share one copy, are forced to share, or each get their own.",
    d: "Some ecosystems require a single version per package, so the resolver must find one that satisfies all dependents or fail. Others allow several versions side by side, with each dependent seeing its own, and merge identical ones to save space. Single-version policies preserve shared identity and are required for packages that expose global state or native symbols. It is hard because multiple versions avoid conflicts at the price of larger installs, duplicated state and types that look the same but are not interchangeable.",
    k: ["One version per package versus many: one version gives consistent behavior and shared state, while many remove most conflicts but allow incompatible copies to meet.", "Deduplicating after resolution versus constraining during it: after the fact is simple, but during resolution can find fewer copies at the cost of more search."],
    p: ["Two copies of a library with global registries are loaded and objects created by one are rejected by the other.", "Disk and download size grow quietly as slightly different ranges accumulate duplicate packages."],
    v: "Install a graph where two dependents accept overlapping ranges of a package; confirm one copy is installed and shared. Make the ranges disjoint and confirm either a conflict is reported or two copies appear, according to the policy.",
    dep: ["dependency-graph","version-constraints","flat-layout","nested-layout","peer-dependencies"]
  },
  "environment-markers": {
    s: "Conditions attached to dependencies, such as operating system, language runtime version or processor family, that the resolver evaluates to decide whether an edge exists.",
    d: "A marker is a small expression evaluated against the target environment. Resolving for the current machine drops edges whose markers are false. Universal resolution evaluates all environments at once and records markers in the lockfile, so one file serves every platform. It is hard because markers multiply the graph: a package may need different versions on different environments, and a resolver that checks only the local machine produces locks that fail elsewhere.",
    k: ["Resolving for the current environment versus for all of them: local is faster and simpler, but only universal locks work on every machine.", "Expression syntax in manifests versus separate per-platform sections: expressions are compact and general, while sections are easier to read and validate."],
    p: ["A lock created for one operating system omits a dependency required on another and CI fails.", "A marker referencing a version string is compared as text and misorders versions."],
    v: "Create a lockfile on one operating system for a package with a marker conditional on another, then install on the other system without resolving; the conditional package is installed and the lockfile is unchanged.",
    dep: ["dependency-graph","platform-specific-dependencies","version-ordering","lockfile-format"]
  },
  "resolution-metadata-cache": {
    s: "A local cache of registry metadata, such as available versions and their dependency lists, that lets resolution run mostly without network requests.",
    d: "Resolution needs the dependency list of many candidate versions. The client stores index documents on disk, revalidates them with conditional requests, and keeps parsed forms in memory. Immutable releases make per-version metadata cacheable forever; only the list of versions changes. Offline mode serves resolution from the cache alone. It is hard because stale entries hide new releases or yanks, because corruption can poison every resolution, and because the cache must be safe for several concurrent processes.",
    k: ["Cache version lists with revalidation versus a fixed expiry: revalidation is correct and cheap in bandwidth, while fixed expiry saves round trips but serves stale data.", "Cache parsed structures versus raw responses: parsed is faster, but must be rebuilt when the client's format changes."],
    p: ["A cached index missing a recent release makes a fresh install report that the version does not exist.", "Two parallel installs write the same cache file and leave a truncated entry."],
    v: "Resolve once online, then disconnect and resolve again; the second run succeeds from cache with zero network requests, and a newly published release appears after a revalidating online run.",
    dep: ["http-cache","registry-metadata-api","package-index","dependency-graph"]
  },
  "lockfile": {
    s: "A generated file recording the exact version, source and hash of every package in the resolved tree, so any later install reproduces the same set.",
    d: "After resolution the manager writes every resolved package with its version, resolved location, integrity hash and its own dependency edges. Subsequent installs read the lockfile and skip the search. It is committed with the project so every developer and CI job installs the same thing. Libraries often do not publish theirs, because consumers resolve for themselves. It is hard because it is generated but reviewed, because it must change minimally, and because a stale or hand-edited lockfile creates states the manager never produced.",
    k: ["Committing the lockfile for applications versus not committing: committed locks give identical installs everywhere, while uncommitted ones keep the tree fresh but unreproducible.", "Lockfile for libraries versus none: a library lock helps its own CI, but consumers ignore it and resolve independently."],
    p: ["Developers regenerate the lockfile locally on every conflict and silently upgrade unrelated packages.", "A lock that is not updated after a manifest edit leaves the manifest and installed tree disagreeing."],
    v: "Delete the installed tree, run a frozen install from the committed lockfile on a second machine, and compare package versions and hashes for the full tree; they match the lockfile entry by entry.",
    dep: ["lockfile-format","integrity-hashes","conflict-driven-resolver","dependency-graph"]
  },
  "lockfile-format": {
    s: "The on-disk structure of the lockfile: a stable, sorted, diff-friendly text document with versioned schema, per-package records and platform conditions.",
    d: "The file is structured text with a schema version, entries sorted by name, one record per resolved package containing version, source, hash, dependencies and conditions. Stable ordering and one field per line keep diffs small. The schema version lets new clients read old files and tells old clients to stop. It is hard because format changes force simultaneous upgrades across a team, because every field is a compatibility commitment, and because merge tools treat it as text although it has internal consistency.",
    k: ["Line-oriented diffable text versus compact machine format: text diffs and merges predictably, but is larger and slower to parse.", "Embedding the dependency edges versus only the chosen versions: edges allow install without registry metadata, while versions-only files are smaller but require metadata fetches."],
    p: ["A new client silently upgrades the lockfile format and older teammates' clients cannot read it.", "Absolute paths or timestamps in the lock produce a diff on every machine."],
    v: "Generate the lockfile twice on different machines from the same inputs and diff the bytes; they are identical, and an older client given a newer schema version refuses with a clear message.",
    dep: ["integrity-hashes","environment-markers"]
  },
  "lockfile-update-policy": {
    s: "The rules for when a command may change the lockfile: only for new or changed dependencies, only for named upgrades, or fully regenerated.",
    d: "On install the manager keeps every locked version that still satisfies the manifest and resolves only what is new. Upgrade commands unlock named packages or all. A check mode fails if the lock would change. Changing a constraint that excludes the locked version forces that package, and its dependents, to move. It is hard because minimal change is not always well defined, because a conservative resolver may keep a vulnerable transitive version indefinitely, and because users cannot tell why a package changed.",
    k: ["Keeping locked versions where possible versus always picking newest: small predictable diffs, but fixes and breakage both arrive only when requested.", "Check-only mode in CI versus auto-updating: CI catches manifest and lock drift, but requires developers to run and commit the update."],
    p: ["A lock refresh intended for one package upgrades a hundred and the commit becomes unreviewable.", "A vulnerable transitive version stays locked for months because nothing forces a re-resolve."],
    v: "Change one constraint in a project and run install; the lockfile diff contains only that package and any whose requirements changed as a consequence, and a check-mode run before commit fails.",
    dep: ["lockfile","version-selection-heuristics","backtracking-resolver","version-constraints"]
  },
  "lockfile-merge-handling": {
    s: "How concurrent branches that both change the lockfile are combined: textual merge, a dedicated merge driver, or regeneration from the merged manifest.",
    d: "Two branches adding different packages produce overlapping edits to a sorted file. Plain text merges often succeed but can yield an inconsistent file. A merge driver instead takes both manifests, discards the conflicted lock and re-resolves preferring the union of locked versions. Teams otherwise resolve by regenerating. It is hard because a textually clean merge can contain two versions of one package, and a regenerated lock can upgrade versions neither branch chose.",
    k: ["Regenerating the lock from merged manifests versus merging text: regeneration is always consistent, but may move versions neither branch asked for.", "A custom merge driver versus manual resolution: driver makes merges automatic and safe, but must be installed on every machine."],
    p: ["A clean textual merge leaves duplicate entries for one package and the next install rewrites the file unexpectedly.", "Taking one side of a conflict drops the other branch's dependencies from the lock."],
    v: "Merge two branches that each add a different package; the merged lockfile contains both with their original versions, validates with the check command and a frozen install succeeds.",
    dep: ["lockfile","lockfile-format","lockfile-update-policy"]
  },
  "frozen-installs": {
    s: "An install mode that refuses to change the lockfile and fails if manifest and lock disagree, which is how CI and deployments obtain reproducible trees.",
    d: "In frozen mode the manager verifies the lock satisfies the manifest, then installs exactly what it records, verifying every hash and never contacting the resolver. Any mismatch aborts with an error. Combined with a populated cache it is also fast. Reproducibility also depends on matching client version, platform and build-time behavior. It is hard because lock-identical trees still differ if install scripts compile code differently, and because a mismatch error must be understood by people, not just fail the pipeline.",
    k: ["Failing on drift versus silently updating: CI catches stale locks, but blocks builds until someone commits the update.", "Frozen install plus hash verification versus lockfile trust alone: a tampered registry or cache is caught, at the price of hashing every file on install."],
    p: ["A frozen install in CI succeeds with an outdated client that interprets the lock differently from developers' clients.", "Build scripts download unpinned files, so identical locks yield different binaries."],
    v: "Install twice in separate clean environments using a frozen install and compare file tree hashes of the results; they match. Edit the manifest without updating the lock and confirm the install fails before fetching anything.",
    dep: ["lockfile","integrity-hashes","install-planner","content-addressed-store"]
  },
});
