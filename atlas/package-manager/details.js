// Details for the package manager plate, part 1: commands, workspaces, manifest, versions.
ATLAS.details("package-manager", {
  "command-line-interface": {
    s: "The entry point that parses arguments, loads configuration and dispatches to subcommands, with consistent flags, exit codes and machine-readable output for scripts and CI.",
    d: "A single executable exposes subcommands that share option parsing, a progress display, logging levels and a common error vocabulary. Interactive use gets progress bars and prompts; non-interactive use gets plain lines, stable exit codes and optional structured output. Most subcommands only build a request and hand it to the resolver, store and installer. It is hard because scripts parse its output for years, so every message, flag and exit code becomes a compatibility surface that is expensive to change.",
    k: ["Structured output flag versus human text only: scripts get a stable contract, at the cost of maintaining two renderings of every result.", "Prompting when a terminal is attached versus never prompting: friendly for people, but CI runs behave differently from local runs unless prompts are explicitly disabled."],
    p: ["Scripts that scrape human-readable messages break silently when wording is improved.", "A command that prompts in a non-interactive job hangs the pipeline until it times out."],
    v: "Run the same command with the structured output flag and with a closed standard input in a CI shell; confirm it exits with a documented nonzero code on failure, never prompts, and emits parseable output.",
    dep: ["configuration-and-environment"]
  },
  "install-command": {
    s: "Reads the manifest and lockfile, plans the difference from what is on disk, fetches missing packages and brings the install layout into line, doing nothing when already in sync.",
    d: "Install is a pipeline: load manifest and lockfile, resolve if the lockfile is missing or stale, compare the wanted tree with the installed one, fetch what the store lacks, link or copy files into place, then run lifecycle hooks. Each stage is skipped when its inputs have not changed, which is why a repeated install can finish in under a second. The difficulty is idempotence and interruption: the command may be killed anywhere and must leave a state the next run can repair.",
    k: ["Resolve only when the lockfile is stale versus always re-resolve: repeat installs are fast and stable, but drift between manifest and lockfile can go unnoticed.", "Incremental diff of the installed tree versus wiping and reinstalling: much faster, but stale leftovers can mask missing declarations."],
    p: ["An install killed halfway leaves a partly linked tree that looks valid to the module loader.", "Treating a tree that happens to work as in sync hides undeclared dependencies until a clean machine fails."],
    v: "Run install twice in a clean checkout; the second run reports no changes and touches no files. Kill the first run midway and confirm a rerun completes and the tree matches the lockfile exactly.",
    dep: ["lockfile","install-planner","download-manager","dependency-graph","install-scripts","frozen-installs"]
  },
  "add-and-remove-commands": {
    s: "Edit the manifest to add or drop a dependency, choosing a constraint from what the registry offers, then re-resolve and install so manifest, lockfile and disk change together.",
    d: "Add queries the registry for the newest acceptable version, writes a constraint to the right dependency section, and runs the same resolve and install path as a normal install. Remove deletes the declaration and prunes anything no longer reachable. The commands must preserve the manifest's formatting and key order so diffs stay small. They are hard because a single edit can change many unrelated lockfile entries if the resolver is allowed to move versions that did not need to move.",
    k: ["Writing a caret-style range versus an exact pin: ranges follow compatible releases automatically, while pins make upgrades deliberate but stale.", "Minimal lockfile change versus re-resolving everything: small reviewable diffs, but some transitive packages stay behind newer fixes."],
    p: ["Rewriting the whole manifest reorders keys and buries a one-line change in formatting noise.", "Adding a package that only works at one peer version can silently pull unrelated upgrades into the lockfile."],
    v: "Add one package in a repository with a committed lockfile; the diff shows one manifest line plus only the new package and its new transitive entries, and every pre-existing locked version is unchanged.",
    dep: ["manifest-file","version-constraints","registry-metadata-api","lockfile-update-policy","install-command"]
  },
  "upgrade-and-outdated": {
    s: "Reports which locked packages have newer versions and how far behind they are, and moves chosen packages forward within or beyond their declared constraints.",
    d: "Outdated compares three versions per package: the locked one, the newest allowed by the constraint, and the newest published. Upgrade re-resolves with selected packages unpinned, then writes the new lock and tree. A separate mode rewrites the manifest constraint itself to cross a major boundary. It must account for pre-releases, yanked versions, deprecations and peer ranges. It is hard because upgrading one package is a graph operation: its dependencies move, and a compatible-looking bump can break a different consumer.",
    k: ["Upgrade within existing ranges versus rewriting ranges: the first is safe and reversible, while the second is the only way to adopt breaking releases.", "Upgrading one package at a time versus all at once: smaller blame surface, but many more installs and test cycles."],
    p: ["Reporting the newest version as the target ignores that it may be a pre-release or incompatible with a peer.", "A blanket upgrade changes hundreds of locked packages in one commit that nobody can review."],
    v: "In a project with a known stale package, run outdated and confirm it lists locked, allowed and latest versions correctly, then upgrade only that package and confirm the lockfile diff touches it and its changed dependencies alone.",
    dep: ["version-constraints","registry-metadata-api","lockfile-update-policy","yanking-and-deprecation","backtracking-resolver"]
  },
  "uninstall-and-rollback": {
    s: "Removes packages and everything only they needed, and returns the project to a previous known-good set, using the lockfile in version control or a recorded transaction.",
    d: "Uninstall deletes a declaration, recomputes reachability, and removes files and links for packages no longer needed, leaving shared store contents for later pruning. Rollback for a project is usually the lockfile and manifest restored from version control followed by a normal install. A system manager instead keeps a transaction history it can reverse. The hard part is not deleting too much: files shared by hard link or symlink, binaries claimed by two packages and files the user edited must survive.",
    k: ["Rollback by restoring the lockfile versus keeping install history in the manager: version control already provides history for projects, while a machine-wide tool has nowhere else to store it.", "Pruning unreachable packages immediately versus leaving them: clean trees, but a later reinstall needs the network again."],
    p: ["Removing a package deletes a binary link that another package also provided, breaking an unrelated command.", "A rollback that restores the manifest but not the lockfile reinstalls the very version that was being escaped."],
    v: "Install a package, then remove it; confirm its files, binary links and orphaned dependencies are gone and a shared dependency still used elsewhere remains. Restore the old lockfile and install; the tree matches the earlier state byte for byte.",
    dep: ["install-planner","binary-linking","store-garbage-collection","lockfile","file-ownership-database"]
  },
  "run-and-exec-commands": {
    s: "Run a named script from the manifest or execute an installed binary with the project's dependencies on the search path, without installing anything globally.",
    d: "The command prepends the project's binary directory to the search path, sets environment variables describing the package, and launches the script through the platform shell. An exec variant can fetch a package into the cache on demand and run its entry point once. It is the everyday way developers invoke tools they declared. It is hard because shell quoting differs by platform, because argument forwarding must be exact, and because running a fetched package is arbitrary code execution chosen at the moment of typing.",
    k: ["Scripts run through the platform shell versus a built-in portable interpreter: familiar syntax everywhere shells exist, but behavior differs by operating system.", "Ephemeral fetch-and-run versus requiring a prior install: convenient one-off tools, but unpinned code runs without review."],
    p: ["Arguments containing spaces or quotes are re-split by the shell and reach the tool altered.", "A one-off run resolves the newest version and executes a release nobody has audited."],
    v: "Declare a script that prints its argument count, call it with an argument containing spaces on two operating systems, and confirm the count and exit code match; confirm tools in the project resolve before same-named system ones.",
    dep: ["binary-linking","manifest-file","configuration-and-environment","content-addressed-store"]
  },
  "publish-command": {
    s: "Packs the project according to its manifest, authenticates to the registry and uploads the archive and metadata as a new immutable version, with checks before anything leaves the machine.",
    d: "Publish validates the manifest, builds the archive from the inclusion rules, runs pre-publish hooks, computes hashes, and sends archive and metadata to the registry with credentials. A dry-run mode shows exactly which files would ship. Modern flows attach provenance generated by the build system. The check that matters most is the file list: secrets, test data and build leftovers are the usual accidents. It is hard because publication is irreversible in practice, so every mistake becomes someone else's dependency.",
    k: ["Allowlist of files to include versus ignore-list of files to exclude: an allowlist leaks nothing new by accident, while an ignore-list ships whatever is forgotten.", "Publish from a developer machine versus only from automated builds: laptops are convenient, but automated builds can carry verifiable provenance."],
    p: ["A credentials file or private key in the working directory is packed and published because it was not ignored.", "A version published with a typo in the manifest can never be corrected, only superseded."],
    v: "Run publish in dry-run mode on a project containing a decoy secrets file and confirm the printed file list excludes it, the version and tag match the manifest, and the reported archive hash equals the hash of a locally packed archive.",
    dep: ["manifest-validation","file-inclusion-rules","package-archive-format","publish-protocol","authentication-and-tokens","provenance-attestations"]
  },
  "configuration-and-environment": {
    s: "Layered settings from command-line flags, environment variables, project files and user files that control registries, caches, proxies, credentials and behavior, with a defined precedence.",
    d: "Settings are read from built-in defaults, a machine-wide file, a user file, a project file, environment variables and flags, with later layers overriding earlier ones. Keys cover registry URLs per scope, cache location, network proxies, certificate authorities, install behavior and log level. Project files are committed, so they must never hold secrets. The difficulty is provenance: when behavior surprises someone, they need to ask which layer set a value, and different tools and wrapper scripts may each read a different subset.",
    k: ["Project-level configuration committed to the repository versus user-only settings: teams share registry choices automatically, but secrets must be kept out and a hostile repository can steer the client.", "Environment variables overriding files versus the reverse: easy per-job overrides in CI, but stray variables change behavior unseen."],
    p: ["A project config file that points at an attacker's registry is honored the moment a developer runs install in a cloned repository.", "An authentication token committed in a project config file is published to everyone with repository access."],
    v: "Run the configuration listing command with a value set in both a user file and an environment variable and confirm it prints the effective value with the layer it came from.",
    dep: ["credential-storage","registry-routing"]
  },
  "workspace-definition": {
    s: "A root manifest that lists member packages by path or pattern so the manager treats a whole repository as one project with shared dependencies.",
    d: "The root declares globs matching member directories, each with its own manifest. The manager discovers members at startup, builds a graph of which members depend on which, and treats those references as local links instead of registry fetches. Settings, overrides and shared tooling are declared once at the root. It is hard because membership must be unambiguous: overlapping patterns, nested workspaces, members excluded by ignore rules and members renamed in a branch all change what the resolver sees.",
    k: ["Pattern-based membership versus an explicit member list: new packages join automatically, but a stray directory with a manifest can join by accident.", "A root manifest that is itself a package versus a pure container: simple small repositories, but root dependencies and member dependencies get mixed together."],
    p: ["A copied example directory matching the glob becomes a member and pulls its dependencies into every install.", "Two members that declare the same name make workspace links resolve to whichever is discovered first."],
    v: "Add a new directory with a manifest under a matching pattern and run the workspace listing command; it appears exactly once, and a directory outside the pattern does not appear.",
    dep: ["manifest-file","package-identity"]
  },
  "local-package-linking": {
    s: "Replaces a registry dependency on a sibling package with a link to its source directory, so edits are visible to dependents immediately without publishing.",
    d: "When a member depends on another member whose version satisfies the constraint, the manager links the dependency's directory into the dependent's lookup path instead of downloading it. Dependencies of the linked package are installed as usual. A link-only dependency form lets any local directory be treated this way. It is hard because the linked package is not in the store, has no integrity hash, and may have unbuilt output, and because a link that is fine in development must become a real version reference at publish time.",
    k: ["Link when the version range matches versus always link by name: ranges keep older pinned consumers honest, but a mismatch silently falls back to the registry copy.", "Rewriting local references to real versions at publish time versus requiring authors to write them: fewer mistakes, but the published manifest differs from the source one."],
    p: ["A published package still contains a local path reference and fails to install for every consumer.", "A linked package whose build output is stale makes dependents test against code that no longer matches the source."],
    v: "Change a function in one member, run a dependent member's tests without publishing or reinstalling, and confirm the dependent sees the change; pack the dependent and confirm its manifest carries a concrete version instead of a path.",
    dep: ["workspace-definition","symlinked-layout","non-registry-sources","manifest-file"]
  },
  "workspace-wide-resolution": {
    s: "Resolves every member's dependencies in one pass and writes a single lockfile, so all packages in the repository agree on versions of anything they share.",
    d: "The resolver receives the union of all members' constraints, with member-to-member references fixed to local sources. One lockfile at the root records the result, and the store and layout are shared across members. Shared versions reduce duplicate downloads and disk use, and make the repository consistent. It is hard because members may have genuinely incompatible needs, because one member's change can reshuffle another's versions, and because tools that read only one member's directory must still find the right packages.",
    k: ["One shared lockfile versus one lockfile per member: consistent versions and one review surface, but any member's change touches a file every member shares.", "Hoisting shared dependencies to the root versus per-member copies: less disk and faster installs, but members can import packages they never declared."],
    p: ["A member that works only because a sibling declared its dependency fails when extracted into its own repository.", "A constraint added in one member forces an upgrade in another that has no tests covering it."],
    v: "Install the whole repository, then list the versions of one shared package resolved for each member; they are identical and the lockfile contains exactly one entry for it unless a declared override says otherwise.",
    dep: ["workspace-definition","conflict-driven-resolver","lockfile","local-package-linking","flat-layout"]
  },
  "release-coordination": {
    s: "Tooling that decides which members need new versions after a change, bumps them and their dependents consistently, and publishes them in dependency order.",
    d: "Change records, commit conventions or diffs against the last release identify which members changed. The tool computes the bump each deserves, updates dependents' constraints, writes release notes and publishes members so that dependencies reach the registry before the packages that need them. Failures midway must be resumable. It is hard because publication is not atomic across packages: a half-finished release leaves the registry holding some new versions whose siblings do not exist yet.",
    k: ["Independent versions per member versus one synchronized version for all: independent versions reflect real change, while a shared number is far easier for users to understand.", "Bump decided by humans in change files versus inferred from commits: reviewable intent, but more process and more chances to forget."],
    p: ["Publishing a dependent before its new dependency exists makes fresh installs fail until the missing release lands.", "A failed run that is restarted from the beginning tries to republish versions the registry already holds."],
    v: "Make a change in a leaf member in a test repository, run the release tool against a local registry, and confirm the publish order is dependencies first, dependents' constraints are updated, and rerunning after killing midway completes without duplicate errors.",
    dep: ["workspace-definition","semantic-versioning","publish-protocol","local-package-linking"]
  },
  "manifest-file": {
    s: "The declarative file at a package's root listing its name, version, dependencies, entry points and metadata, read by the resolver, packer, registry and tools alike.",
    d: "The manifest is a plain data file in a structured text format, with a documented schema. The resolver reads its dependency sections, the packer reads inclusion rules, the loader reads entry points and the registry stores a copy as metadata. Tools may add their own sections that the manager ignores. It is hard because the file serves so many readers: a new field must be harmless to old clients, and a dependency written in a form only some tools understand splits the ecosystem.",
    k: ["Declarative data versus an executable manifest: data can be read without running code and analyzed safely, while executable files allow computed logic at the cost of being unreadable until run.", "Ignoring unknown fields versus rejecting them: tolerant of tool extensions, but typos in real field names pass silently."],
    p: ["A misspelled dependency section is ignored, so the dependency is never installed and nothing complains until runtime.", "Tools that rewrite the file drop comments or reorder keys and create noisy diffs."],
    v: "Parse a manifest with a deliberately misspelled field and an extra tool section with the validate command; the misspelling is reported while the tool section passes untouched, and the resolver reads the same dependencies the file shows.",
    dep: []
  },
  "package-identity": {
    s: "The name and version pair, plus any namespace, that uniquely identifies a release in a registry and everywhere the package is referenced.",
    d: "A package is named by a string drawn from a restricted character set, optionally prefixed by a scope or owner, and a release is that name plus a version. The name is globally unique within a registry and is the key in every index, lockfile entry and import path. Normalization rules decide whether differences in case, separators or lookalike characters count as the same name. It is hard because names are permanent and visible: a bad one cannot be changed, and near-duplicates enable impersonation.",
    k: ["Case and separator normalization versus exact match: stops lookalike names from coexisting, but forbids names that differ only by punctuation.", "Flat global names versus owner-qualified names: global names are short and memorable, while qualified names make impersonation harder at the cost of longer references."],
    p: ["Two names that normalize identically are both accepted by an older client, letting one shadow the other.", "A package renamed after release leaves old lockfiles pointing at a name that now means something else."],
    v: "Attempt to publish names differing only in case, separator or a lookalike character from an existing one to a test registry; each is rejected or normalized to the existing identity, and the lockfile records the canonical name.",
    dep: ["manifest-file"]
  },
  "scopes-and-namespaces": {
    s: "A prefix owned by a user or organization that groups related packages and prevents others from claiming names within it.",
    d: "A scope such as an organization name precedes the package name, and only the owner may publish under it. Scopes can be mapped to different registries by client configuration, which is how private packages are kept apart from public ones. Some ecosystems have no scopes and rely on name reservation policy instead. It is hard because scope ownership itself becomes a scarce name, because an unclaimed scope is open to squatting, and because routing by scope only protects clients that configure it.",
    k: ["Mandatory scopes versus optional scopes: mandatory scopes give every package an owner and a boundary, but make names longer and complicate migration of old unscoped ones.", "Scope mapped to a registry in client config versus resolved by the registry: clients decide where each scope is fetched from, but a missing mapping silently sends requests to the public registry."],
    p: ["A company uses a private scope but never claims it publicly, and an attacker registers it and receives private-name requests.", "Transferring a scope silently changes who controls every dependent's future updates."],
    v: "Configure a private scope to point at an internal registry, request a package in that scope with the internal registry stopped, and confirm the client fails instead of querying the public registry.",
    dep: ["package-identity","registry-routing","ownership-and-permissions"]
  },
  "entry-points-and-exports": {
    s: "Manifest fields that say which files are the package's public surface, such as its main module, per-condition export maps and executable commands.",
    d: "The manifest maps import names and subpaths to files, optionally varying by condition such as the consumer's module system, environment or platform. It can also list executables to link into a binary directory. An export map is a boundary: files not listed cannot be imported by consumers. It is hard because the map is part of the package's API and must stay in sync with the build output, and because loaders in different tools interpret conditions and fallbacks slightly differently.",
    k: ["Explicit export map versus every file importable: explicit maps let authors reorganize internals freely, while open access is simple but makes every file a public API.", "Condition-based alternatives versus separate packages per environment: one name works everywhere, but conditions can resolve differently across tools."],
    p: ["A map that lists a file the build never produced makes the package fail to load only in consumers.", "Two conditions that both match select a different file in each tool, giving two copies of the same module."],
    v: "Pack the package, install it into a fresh project and import each documented entry point and one unlisted internal file; the documented ones load and the internal one is refused.",
    dep: ["manifest-file","binary-linking","file-inclusion-rules"]
  },
  "manifest-metadata": {
    s: "Descriptive fields such as license, authors, repository, keywords and description that the registry indexes and that tools use for compliance and display.",
    d: "These fields do not affect resolution but drive everything around it: the registry shows them on package pages and indexes keywords for search, license tools read the license expression, and links let users find source and issues. License is usually an expression in a standard identifier syntax. It is hard because the data is unverified author claims: the repository link may point at someone else's project, and a stated license may disagree with files inside the archive.",
    k: ["Free-text license versus a standard identifier expression: identifiers can be checked by policy tools automatically, while free text carries nuance machines cannot read.", "Registry verifying metadata against the source host versus trusting the author: verification prevents false links, at the cost of coupling to hosting services."],
    p: ["A repository field pointing at an unrelated project lends it false credibility on the registry page.", "A license field that disagrees with the license file leaves downstream compliance reviews wrong."],
    v: "Publish a test package with a license expression, repository and keywords; confirm the registry API returns them unchanged and that a search by keyword finds the package.",
    dep: ["manifest-file"]
  },
  "file-inclusion-rules": {
    s: "Rules in the manifest or ignore files that decide which files go into the published archive, with a few always included and a few always excluded.",
    d: "The packer starts from the working directory, applies an include allowlist or exclude patterns, always adds the manifest, license and entry files, and always drops version control directories and the manager's own state. The resulting list is what consumers download. Dry-run output shows it. It is hard because several rule sources can disagree, patterns follow subtly different matching semantics from version-control ignore files, and nested directories can carry their own rules.",
    k: ["Allowlist in the manifest versus separate ignore files: one explicit list is easy to audit, while ignore files compose with existing tooling but fall back to shipping everything.", "Always-included files versus fully author-controlled: guarantees a license and manifest are present, but surprises authors who wanted them omitted."],
    p: ["Build output ignored by version control is also ignored by the packer, and the package ships without its compiled files.", "A nested ignore file overrides the root rule and drops a needed directory."],
    v: "Run pack in dry-run mode, list the files, and compare against the files present in the unpacked archive from a real pack; the sets are identical, and a test secrets file is in neither.",
    dep: ["manifest-file"]
  },
  "manifest-validation": {
    s: "Checks that the manifest conforms to the schema before install or publish: valid names, parseable constraints, legal values and no contradictory sections.",
    d: "A validator parses the file, checks required fields, name syntax, version syntax and every constraint expression, flags deprecated or unknown fields and rejects contradictions such as the same package as both optional and runtime with incompatible ranges. The registry repeats the checks server-side because clients cannot be trusted. It is hard because strictness is a compatibility decision: tightening a rule breaks existing packages that were previously accepted, so validators often warn long before they reject.",
    k: ["Warn first, reject later versus reject immediately: gives authors time to fix, but bad data accumulates in the registry meanwhile.", "Validate on both client and server versus server only: authors see errors before uploading, but two implementations must be kept in agreement."],
    p: ["Client and registry disagree on a rule, so a package passes the client check and is rejected at upload time.", "A rule tightened without a migration period breaks the release pipeline of every affected package at once."],
    v: "Feed the validator manifests with a bad name, an unparseable range and a contradictory section; each yields a specific message naming the field, and the same manifests are refused by the registry on upload.",
    dep: ["manifest-file","version-constraints","package-identity"]
  },
  "version-schemes": {
    s: "The rules for what a version string looks like and how versions are compared, from dotted numbers to calendar dates to arbitrary labels.",
    d: "A scheme defines the syntax of versions and a total order over them. Common choices are dotted numeric components with optional suffixes, date-based versions, and monotonically increasing build numbers. The registry stores the string; the client parses and compares it. System package managers add an epoch and a release revision. It is hard because the order must be identical on every client and in the registry's index, and because real-world strings that violate the scheme still exist in old releases.",
    k: ["A strict scheme versus accepting any string: strict schemes allow reliable range logic, while tolerance admits old oddly-versioned packages that then compare unpredictably.", "Numeric versions versus calendar versions: numbers can signal compatibility, while dates only signal age."],
    p: ["Two clients parse the same odd version string differently and pick different releases for the same range.", "A leading zero or extra component is treated as equal or as different depending on the implementation."],
    v: "Feed one list of tricky versions with leading zeros, extra components and suffixes into the client and the registry's own sorter; both produce the identical ordering, and a malformed string is rejected by both.",
    dep: ["version-ordering"]
  },
  "semantic-versioning": {
    s: "A convention where major, minor and patch numbers signal breaking changes, additions and fixes, letting constraints accept compatible updates automatically.",
    d: "Under semantic versioning a major increment signals incompatible change, a minor one backward-compatible additions, and a patch one backward-compatible fixes. Ranges such as 'compatible with 1.4' rely on that promise to accept new minors and patches safely. Zero-major versions are conventionally treated as unstable. It is hard because the promise is made by humans: a public API is hard to define, a bug fix changes behavior someone depended on, and authors disagree on what counts as breaking.",
    k: ["Trusting semantic-versioning promises in ranges versus pinning everything: automatic bug fixes arrive, but every author's mistake reaches users the same hour.", "Treating zero-major versions as freely breaking versus applying normal rules: sets honest expectations, but leaves popular unfinished packages without a compatibility signal."],
    p: ["A patch release that quietly changes behavior is pulled into every project with a compatible range.", "Authors bump the major for trivial reasons, fragmenting users across versions that are actually compatible."],
    v: "Take a package's published history and check that each release marked minor or patch still passes the previous release's public test suite; every failure is a violated promise visible to range users.",
    dep: ["version-schemes","version-constraints"]
  },
  "prerelease-and-build-metadata": {
    s: "Version suffixes marking unstable releases that ranges skip by default, and build identifiers that are carried along but ignored when ordering.",
    d: "A pre-release suffix sorts below the plain version it precedes, and ranges normally exclude pre-releases unless the range itself mentions one on the same version core. Build metadata, written after a plus sign, distinguishes builds without affecting order. Tags such as 'next' point at pre-releases for people who opt in. It is hard because defaults protect stable users but surprise testers, and because two versions that differ only in build metadata compare as equal yet are different archives.",
    k: ["Excluding pre-releases from ranges by default versus including them: stable users are protected from unfinished code, while testers must name pre-releases explicitly.", "Build metadata ignored in ordering versus significant: avoids bogus ordering between builds, but the registry may accept two releases the client considers identical."],
    p: ["A beta release is published under the default tag and installed by every user who runs a fresh install.", "Two published versions differing only in build metadata collide in client maps keyed by ordered version."],
    v: "Publish 2.0.0-beta.1 and 2.0.0 to a test registry; a range accepting 2.x resolves to 2.0.0 and never beta.1, while a range naming the beta resolves to it.",
    dep: ["semantic-versioning","version-ordering","tags-and-channels"]
  },
  "version-constraints": {
    s: "Expressions such as ranges, comparators, wildcards and compatible-release operators that state which versions of a dependency a package accepts.",
    d: "A constraint is parsed into a set of intervals over the version order: exact pins, comparisons, hyphen ranges, caret and tilde forms that allow compatible updates, and unions or intersections of these. The resolver treats each as a predicate over candidate versions. It is hard because syntaxes differ across ecosystems yet look alike, because the empty intersection of two ranges is the core of every conflict, and because overly tight or overly loose ranges both cause failures at scale.",
    k: ["Wide ranges versus tight ranges: wide ranges let the resolver find one shared version across a graph, while tight ones give predictability and cause conflicts.", "Upper bounds on dependencies versus none: upper bounds prevent known breakage, but make every future release require updates up the tree."],
    p: ["A library caps a dependency at the current major, and every user is stuck until that library publishes a new release.", "Two similar-looking range forms mean different things and an author picks the wrong one."],
    v: "For a table of constraints and candidate versions, evaluate the predicate in the client and compare against the registry's documented expectations; the accepted sets match for every case including pre-releases and boundaries.",
    dep: ["version-ordering","semantic-versioning","prerelease-and-build-metadata"]
  },
  "version-ordering": {
    s: "The total order over version strings that every comparison, range check and 'latest' calculation depends on.",
    d: "The comparator splits a version into components and compares them in turn, numerically for numbers and lexically or by defined rank for labels, with rules for missing components and for pre-release suffixes. System managers add an epoch that outranks everything and treat tildes and similar marks specially. The order must be total, transitive and consistent between client and registry. It is hard because edge cases such as numeric overflow, mixed alphanumeric components and equal-but-different strings expose implementation differences.",
    k: ["Numeric component comparison versus string comparison: numbers sort as people expect, but very long components can overflow fixed-size integers.", "An epoch for forced reordering versus never reordering: lets a project fix a bad numbering scheme, but every comparison must now consider it."],
    p: ["Comparing components as text makes 1.10 sort below 1.9 and hides the newest release.", "A comparator that is not transitive makes sorted candidate lists, and thus resolution, depend on input order."],
    v: "Sort a fixed fuzz list of version strings with both the client and the registry's sort routine; the orders are identical and sorting a shuffled copy repeatedly always yields the same sequence.",
    dep: []
  },
  "tags-and-channels": {
    s: "Movable named labels such as 'latest' or 'beta' that point at specific versions, giving users stable names for release streams.",
    d: "A tag maps a name to one published version in the registry's metadata. Installs without an explicit version follow the default tag, and teams can maintain channels for pre-releases or long-term support lines. Tags are mutable pointers, unlike versions, so moving one is an administrative act that affects everyone following it. It is hard because the default tag decides what new users get, because tags must not point at yanked versions, and because a moved tag changes behavior without any manifest changing.",
    k: ["Mutable tags versus immutable versions only: tags give friendly channels, but anything that records a tag instead of a version loses reproducibility.", "Automatic default-tag movement on publish versus manual: fresh releases reach users faster, but a bad publish becomes the default instantly."],
    p: ["A pre-release published without a tag argument takes over the default tag.", "A lockfile-free install follows a tag and gets a different version from one minute to the next."],
    v: "Publish a pre-release with a named tag, then install with no version and confirm the stable release is chosen; install by tag name and confirm the pre-release is chosen and recorded in the lockfile as an exact version.",
    dep: ["registry-metadata-api","prerelease-and-build-metadata"]
  },
});
