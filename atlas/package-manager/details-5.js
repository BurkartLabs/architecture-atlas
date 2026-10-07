// Details for the package manager plate, part 5: mirrors and private registries, system package manager, cross-cutting concerns.
ATLAS.details("package-manager", {
  "mirrors-and-proxies": {
    s: "Servers that replicate or cache a registry's content so installs are faster, survive outages and can be monitored or filtered by the organization running them.",
    d: "A full mirror copies every release on a schedule; a caching proxy fetches a package on first request and keeps it. Clients point at the mirror through configuration. Because hashes and signatures travel with the content, a mirror cannot alter what clients accept, only withhold or delay it. Proxies can enforce rules such as blocking new releases for a cooling-off period. It is hard because mirrors lag the source, must propagate yanks and removals, and have to store a growing archive.",
    k: ["Full mirror versus caching proxy: a full mirror works if the upstream is gone, while a proxy stores only what is used and is far cheaper.", "A cooling-off delay for new releases versus immediate access: delay gives time to detect malicious releases, but also delays real security fixes."],
    p: ["A mirror that ignores yank flags keeps serving a withdrawn release long after the registry stopped.", "A proxy caches an error response and keeps returning not-found for a package that exists."],
    v: "Point a client at a proxy, install, then stop the upstream and install again; the second install succeeds from the proxy, and a package yanked upstream stops resolving through the proxy within its documented lag.",
    dep: ["http-cache","registry-metadata-api","integrity-hashes","yanking-and-deprecation"]
  },
  "private-registries": {
    s: "A registry run by an organization for internal packages, usually combined with the public registry so one install can draw on both.",
    d: "The private registry implements the same protocol, with authentication on every request and access control per package or scope. It may proxy public packages as well, giving one endpoint for everything. Internal packages publish through the same command and token model as public ones. It is hard because combining sources invites dependency confusion, where a public package with the same name as an internal one wins, and because it adds an operational service every developer and build depends on.",
    k: ["One virtual registry merging private and public versus separate registries per scope: one endpoint is simple, but name collisions need explicit rules, while separation is safer but more configuration.", "Hosted service versus self-operated: hosted needs no maintenance, while self-operated keeps all code on premises."],
    p: ["An internal package name is claimed on the public registry and the merged endpoint serves the higher public version.", "The private registry is down and every build in the company stops."],
    v: "Publish an internal package whose name also exists publicly with a higher version; an install through the configured setup resolves the internal one, and the public one is never fetched, as shown in the registry's access logs.",
    dep: ["registry-routing","authentication-and-tokens","publish-protocol","mirrors-and-proxies"]
  },
  "registry-routing": {
    s: "Client configuration that decides which registry serves each package or scope, so private names never reach the public registry and public names are fetched from a vetted source.",
    d: "Rules map scopes, name patterns or package lists to registry URLs, each with its own credentials. The resolver consults them for every package. Defaults apply when no rule matches. Strict modes forbid fallback: a package routed to one registry is never requested from another. It is hard because the safe default is to fail when the intended registry lacks the package, which people dislike, and because routing must be consistent across every machine and CI job.",
    k: ["Strict single-source per package versus first-match fallback across registries: strict prevents confusion attacks, while fallback tolerates gaps but lets a hostile registry supply a name.", "Routing by scope versus by explicit package list: scopes are compact and tied to ownership, while lists work for unscoped names at higher maintenance."],
    p: ["A new machine lacks the routing file and sends internal package names to the public registry.", "A fallback rule quietly satisfies a missing internal package with an identically named public one."],
    v: "Configure routing and install with the private registry stopped; the install fails naming the registry that should have served the package, and no request for that name appears in the public registry's logs.",
    dep: ["configuration-and-environment","scopes-and-namespaces","credential-storage"]
  },
  "credential-storage": {
    s: "Where registry tokens and passwords are kept on a machine or in CI: user files with restricted permissions, the operating system's secret store, or environment variables injected per job.",
    d: "The client reads credentials per registry from a user-level file, a system keychain or environment variables, and attaches them only to requests for that registry's host. Configuration files commonly reference an environment variable instead of containing the token. Project files must never hold secrets. It is hard because credentials end up in logs, container images and committed files, and because sending them to the wrong host after a redirect hands them to an attacker.",
    k: ["Operating system secret store versus plain permission-restricted file: the store protects at rest, but is unavailable in containers and CI.", "Environment variable references versus literal tokens: references keep secrets out of files, but leak through process listings and build logs."],
    p: ["A token in a project configuration file is committed and published with the package archive.", "A request follows a redirect to a different host with the authorization header still attached."],
    v: "Install with a token in the environment and capture network traffic and logs; the token is sent only to the registry host it belongs to, never appears in the log output, and is absent from the packed archive.",
    dep: []
  },
  "offline-installs": {
    s: "Installing with no network access by serving everything from the local cache or a pre-populated store, failing clearly if anything is missing.",
    d: "An offline flag forbids network requests. The resolver uses cached metadata or the lockfile, and the installer takes archives from the cache, verifying hashes as usual. Pre-populating the cache is done by a fetch command run while online, or by copying a directory. It is hard because partial caches fail late, in the middle of an install, and because cached metadata is stale by definition so non-locked resolution can pick old versions.",
    k: ["Lockfile-driven offline install versus offline resolution from cached metadata: lock-driven needs only archives and is deterministic, while offline resolution needs the full metadata cached.", "Fail on first missing item versus report all missing items upfront: upfront is more useful, but requires planning before touching disk."],
    p: ["An offline install fails ten minutes in because one platform-specific package was never cached.", "An offline resolution silently picks older versions because the cache lacked newer metadata."],
    v: "Populate the cache with a fetch command, disable the network, and run a frozen install in a clean directory; it succeeds with zero network attempts, and removing one cached archive makes it fail before modifying anything.",
    dep: ["frozen-installs","content-addressed-store","resolution-metadata-cache","lockfile"]
  },
  "vendoring": {
    s: "Committing or archiving the exact source of every dependency alongside the project, so builds need neither the registry nor the cache.",
    d: "A vendor command copies each locked package's files into a directory in the repository, records their hashes and configures the build to use them. Builds then read from the vendor directory. It makes the project independent of registry availability and removals, and allows code review of changes to dependencies. It is hard because the repository grows, because reviewers cannot read thousands of changed files, and because the vendored copy can diverge from the lock if edited or not refreshed.",
    k: ["Vendoring in the repository versus a mirrored cache: vendoring makes builds hermetic and reviewable, but bloats history, while a mirror keeps repositories small but needs infrastructure.", "Vendoring source only versus built artifacts too: source is smaller and auditable, while artifacts avoid per-machine compile time."],
    p: ["Someone patches vendored code in place and the next vendor refresh overwrites the fix silently.", "Vendored directories drift from the lockfile and the build uses code the lock no longer describes."],
    v: "Vendor a project, then build in an environment with the registry blocked; the build succeeds, a verify command confirms each vendored file matches the lock's hash, and editing one file makes verification fail.",
    dep: ["lockfile","integrity-hashes","content-addressed-store"]
  },
  "system-package-format": {
    s: "The archive a system package ships as: file payload plus control metadata naming the package, version, dependencies, conflicts, scripts and configuration files.",
    d: "A package contains the files to place on the system with their paths, ownership, permissions and checksums, and a control section listing name, version with epoch and revision, architecture, dependencies, conflicts, replaces, provides and maintainer scripts. Files marked as configuration receive special treatment. Distinct packages are built from one source into many binary packages. It is hard because file paths are global across the system, so every package's metadata must be precise about what it owns.",
    k: ["Splitting one source into many fine-grained packages versus few large ones: fine splits let users install less, but multiply dependency relationships to maintain.", "Declared file lists versus discovered at build: declared lists make conflicts detectable before install, while discovery is easier to author."],
    p: ["Two packages ship the same path without declaring a conflict, and install order decides which file wins.", "A package omits a runtime library from its dependencies and works only on machines that happen to have it."],
    v: "Inspect a built package's control data and file list, then install it in a clean container; every declared path exists with the stated mode, and the dependency list suffices for the program to start there.",
    dep: ["version-schemes","maintainer-scripts","config-file-handling"]
  },
  "file-ownership-database": {
    s: "A local database recording every installed package, its version and each file it owns with checksums, enabling removal, conflict detection and verification.",
    d: "On install, the manager records the package's metadata and its file list with sizes, modes and digests. Queries answer which package owns a path, what a package installed, and whether a file has changed since. Removal deletes exactly the files a package owns, skipping those it shares or that were modified. The database is the source of truth for the machine's state. It is hard because it must stay consistent through crashes, and because files created by scripts or users are outside its knowledge.",
    k: ["Authoritative database versus scanning the file system: the database answers instantly and is exact about intent, but diverges if files are changed outside the manager.", "Recording checksums versus only paths: checksums allow integrity verification, but cost space and time at install."],
    p: ["A crash during install leaves files on disk that no package owns, unremovable by the manager.", "Restoring the root file system from backup without the database makes the manager believe packages are installed that are not."],
    v: "Install a package, query which package owns one of its files, modify that file and run the verify command; the owner is reported correctly and the verify output names the changed file.",
    dep: ["system-package-format","system-transactions"]
  },
  "system-dependency-solver": {
    s: "Computes which packages to install, upgrade or remove to satisfy a request, honoring dependencies, conflicts, alternatives and user preferences across an entire distribution.",
    d: "The solver takes the installed set, available repository packages and the request, and finds a consistent target set. Constraints include versioned dependencies, disjunctions such as 'either of these', conflicts, and replacements. Preferences minimize removals and keep installed versions where possible. Many implementations use a satisfiability solver. It is hard because repositories hold tens of thousands of packages with alternatives, so naive search explodes, and because a surprising solution that removes a core package can break the machine.",
    k: ["Minimizing changes versus maximizing versions: fewer changes reduces risk, while newest versions bring fixes and features.", "Interactive confirmation of large removals versus automatic: protects the system from silent damage, but blocks unattended upgrades."],
    p: ["A solution removes a large metapackage because it was the easiest way to resolve a conflict.", "Different repository snapshots produce different plans for the same command and surprise administrators."],
    v: "Request installation of a package with a conflicting alternative and examine the plan; it lists every added, upgraded and removed package, and applying it leaves the dependency check command reporting no unmet dependencies.",
    dep: ["sat-based-resolver","virtual-packages-and-provides","system-repository-metadata"]
  },
  "virtual-packages-and-provides": {
    s: "Names that several packages can satisfy, such as a mail server or a text editor, letting dependencies state a capability instead of a specific implementation.",
    d: "A package declares that it provides a virtual name, optionally with a version. Other packages depend on that name, and the solver picks any provider, preferring one already installed or the most common choice. Alternative links choose which provider supplies a command name when several are present. Replacement and conflict declarations manage migration between implementations. It is hard because virtual names need agreed definitions, and the choice among providers affects behavior users notice.",
    k: ["Depending on capabilities versus on specific packages: capabilities allow substitution, but the contract for each name is informal and varies.", "Preferring an installed provider versus the default one: avoids churn on upgrade, but systems drift away from the standard configuration."],
    p: ["A virtual dependency is satisfied by a provider that lacks a feature the dependent needs.", "Two providers of one command name are installed and the active one changes after an unrelated upgrade."],
    v: "Depend on a virtual name with two providers available on a test system; the solver installs one deterministically, preferring an already installed provider, and the command name resolves to it.",
    dep: ["system-package-format","system-dependency-solver"]
  },
  "system-repository-metadata": {
    s: "Signed indexes that list the packages in a repository with their dependencies and hashes, which the client downloads and verifies before planning any change.",
    d: "A repository publishes a top-level signed file naming the current package lists and their digests. Clients fetch it, verify the signature with keys installed on the system, then fetch the lists it points to. Metadata is compressed and may be delivered as differences against the previous version. Several repositories can be combined with pins setting priority. It is hard because freshness, key distribution and mirror consistency interact: a mirror partly updated mixes old lists with new packages.",
    k: ["Signing the index with hashes of everything versus signing each package: index signing is efficient and one signature covers all, while package signing survives mirrors that rewrite indexes.", "Incremental metadata diffs versus full downloads: much less bandwidth, but diff chains must be applied correctly."],
    p: ["A mirror mid-update serves a new index pointing at package files not yet copied, causing hash and not-found errors.", "Installed trust keys are never rotated and a compromised key stays trusted."],
    v: "Update metadata from a test repository whose index signature is corrupted; the client refuses it and keeps the old lists. With a valid signature, listed package hashes match downloaded files exactly.",
    dep: ["package-signatures","key-distribution","integrity-hashes","mirrors-and-proxies"]
  },
  "system-transactions": {
    s: "Applies a set of package changes as one unit with ordering, locking, journaling and recovery, so a failure or power loss leaves a repairable system.",
    d: "The manager takes a lock, downloads and verifies everything first, then applies steps in dependency order: unpack, run scripts, update the database. A journal records progress so an interrupted run can be completed or rolled back. Some systems keep file-system snapshots or generations, making whole-system rollback cheap. It is hard because files in shared directories change one at a time, because scripts have side effects the manager cannot undo, and because a failure partway through an upgrade of core libraries can leave the machine unbootable.",
    k: ["Snapshot or generation-based rollback versus journaling file changes: snapshots give exact rollback, but need a file system that supports them.", "Downloading everything before changing anything versus streaming installs: avoids half-applied upgrades from network failures, but needs disk space for all packages."],
    p: ["Power loss during replacement of a core library leaves mismatched versions and no working shell.", "A package script fails midway and the database claims the package is fully installed."],
    v: "Kill the manager mid-upgrade on a test system, reboot and run the recovery command; the system returns to either the old or the new consistent state, the database matches the files, and verify reports no mismatch.",
    dep: ["file-ownership-database","maintainer-scripts","system-triggers"]
  },
  "maintainer-scripts": {
    s: "Scripts a system package runs before and after installation, upgrade and removal to create users, register services and migrate data, with defined arguments for each case.",
    d: "Each package may include pre-install, post-install, pre-remove and post-remove scripts. The manager runs them as the administrator with arguments indicating whether this is a fresh install, an upgrade from some version or a removal. Scripts must be idempotent because they may rerun after a failure. They are hard because they run with full privileges, cannot easily be undone, interact with services that may not be running, and their failure leaves a package in a half-configured state.",
    k: ["Imperative scripts versus declarative hooks for common tasks such as creating users: scripts handle anything, while declarative hooks are checkable and reversible.", "Running scripts inside the live system versus in an isolated root: live runs see the real services, but isolation makes image builds and testing safer."],
    p: ["A script that assumes a service is running fails during an image build and aborts the whole transaction.", "A removal script deletes user data that an administrator expected to be kept."],
    v: "Install, upgrade and remove a package with scripts that log their arguments in a test container; the log shows the expected invocations for each case, and running the install script twice leaves the same state.",
    dep: ["system-package-format","system-transactions"]
  },
  "system-triggers": {
    s: "Hooks that run once, after a transaction, when files in watched paths changed, such as rebuilding caches or font lists, instead of in every package.",
    d: "A package declares interest in a directory or capability. After the transaction the manager runs each interested trigger once, with the list of changed packages or paths, instead of every package running the same cache-refresh script. This saves time and avoids ordering problems between packages. Triggers can also defer work until the system is ready. It is hard because a trigger must handle any subset of changes, and a failing trigger blocks or confuses unrelated installs.",
    k: ["Deferred shared triggers versus per-package scripts: one refresh per transaction is far faster, but the trigger must work for any combination of changes.", "Triggers that block the transaction on failure versus warn only: blocking keeps the system consistent, while warning avoids a broken cache stopping unrelated updates."],
    p: ["A trigger runs before all files from the transaction are in place and indexes an incomplete directory.", "Triggers firing in a loop because each rewrites files the other watches."],
    v: "Install ten packages that each add a font to a watched directory in one transaction; the cache trigger runs exactly once afterward, and the resulting cache lists all ten fonts.",
    dep: ["system-transactions","file-ownership-database"]
  },
  "config-file-handling": {
    s: "The rules that keep administrators' edits to configuration files across upgrades: compare the installed, previous and new package versions, and merge or ask when they differ.",
    d: "Files marked as configuration are recorded with the digest of the packaged version. On upgrade the manager compares the file on disk with the old packaged digest and the new packaged file. If the user never edited it, it is replaced. If only the user changed it, it is kept. If both changed, the new version is saved beside it or the user is prompted. Removal keeps configuration files unless purge is requested. It is hard because three-way merging of arbitrary formats is unreliable.",
    k: ["Keeping the user's file and saving the new one beside it versus overwriting and keeping a backup: keeping avoids breaking a working system, but new defaults may never be seen.", "Prompting the administrator versus applying a default policy: prompts are safest, but unattended upgrades cannot answer them."],
    p: ["An unattended upgrade stalls on a prompt about a changed configuration file.", "A new default setting needed by the new version is left out because the old edited file was kept."],
    v: "Install a package, edit its configuration file, upgrade to a version that changes the same file, and confirm the edited file is preserved, the new version is saved alongside, and the upgrade report names it.",
    dep: ["system-package-format","file-ownership-database","system-transactions"]
  },
  "trust-model": {
    s: "The decision about who and what a client believes: the registry alone, a signing key, the publisher, a build platform, or nobody without independent verification.",
    d: "Every download is code run with the user's authority, so the trust model decides the worst case. Options range from trusting a registry over secure transport, to verifying signatures by publisher keys, to requiring attestations from known build environments. The lockfile's hashes extend trust from the first install to later ones. The decision shapes key management, publishing flows, mirror design and the amount of friction. It is hard because every extra check costs adoption.",
    k: ["Trusting the registry as the sole authority versus end-to-end publisher signing: the first needs no key infrastructure, while the second survives registry compromise but needs identity and recovery.", "Verification enforced by default versus opt-in: enforcement protects everyone, while opt-in is adopted by those who already care."],
    p: ["A system with strong verification that is optional protects only users who enable it and gives false confidence to others.", "Trusting a mirror's index without end-to-end checks lets it substitute packages."],
    v: "List the parties whose compromise would let an attacker install code on a clean machine from a lockfile; for each, name the control that blocks it, and attempt each substitution on a test setup to confirm it is blocked.",
    dep: ["integrity-hashes","package-signatures","provenance-attestations","authentication-and-tokens"]
  },
  "release-immutability": {
    s: "The commitment that a released version never changes, which every lockfile, mirror, cache and hash relies on, and which constrains how mistakes and removals are handled.",
    d: "If a version can be replaced, hashes in lockfiles become wrong, caches serve different content and reproducibility is lost. Immutability therefore underlies the store, mirrors, signing and offline use. It forces corrections to be new versions, and makes yanking, deprecation and tombstones the tools for withdrawal. The cost is that mistakes, secrets and legally problematic content cannot simply be erased. It is hard because policy exceptions are demanded precisely when they are most damaging.",
    k: ["Strict immutability versus allowing narrow exceptions: strictness keeps every guarantee, while exceptions fix real emergencies but weaken what hashes mean.", "Tombstoned version numbers versus freeing them: tombstones stop substitution, but consume number space forever."],
    p: ["A deleted release is republished with different content and silently breaks lockfile hashes and caches.", "A leaked secret in an old release cannot be removed and has to be revoked instead."],
    v: "Attempt to change the contents behind a published version through every write path of a test registry, including republish and admin tools; each is refused or recorded, and the archive hash never changes.",
    dep: ["immutability-and-unpublish","content-addressed-store","lockfile","integrity-hashes"]
  },
  "determinism": {
    s: "How far two installs, on different machines or at different times, produce the same tree: locked versions, fixed hashes, ordering, platform handling and controlled build steps.",
    d: "Determinism needs a lockfile, hash verification, a stable resolver and layout algorithm, and the removal of unpinned inputs such as install-time downloads and time-dependent scripts. Native builds and platform differences are the usual leaks. Archives with normalized metadata allow bit-for-bit comparison of built artifacts. The goal is rarely absolute: teams choose a level, such as identical package versions, identical file trees, or identical built binaries. It is hard because each step toward it costs convenience.",
    k: ["Identical versions versus identical bytes: versions are easy with a lockfile, while identical bytes need controlled builds and normalized archives.", "Pinning everything versus allowing compatible updates: pinned installs are predictable, while updates deliver fixes automatically."],
    p: ["Two CI runs from the same lockfile differ because a script downloads an unpinned file.", "A tree is identical in versions but different in layout, and only one works with a tool relying on hoisting."],
    v: "Run a frozen install on two different machines and compare a hash over the full installed file tree, and repeat a day later; matching results show determinism at that level, and a differing file points to the leaking step.",
    dep: ["lockfile","frozen-installs","integrity-hashes","install-scripts","package-archive-format"]
  },
  "compatibility-promises": {
    s: "What the ecosystem promises about change: version meaning, deprecation periods, protocol and manifest stability, and how long old clients and old releases keep working.",
    d: "Packages promise stability through version numbers; the manager promises stability of manifest format, lockfile format, command output and registry protocol. Clients installed years ago must still resolve and install. Resolution works only if authors keep promises, and ranges amplify mistakes. The promises set the pace of change: format changes need long transitions and every breaking release has a very large audience. It is hard because the ecosystem is made of independent parties who cannot be forced to keep promises.",
    k: ["Strict compatibility with long transitions versus fast evolution: stability protects the installed base, but slows fixes and leaves legacy code in place.", "Trusting authors' version semantics versus testing compatibility automatically: trust is cheap but frequently wrong, while checks add cost but catch breaks."],
    p: ["A tool update changes lockfile output and older teammates' clients fail to read the repository.", "An author's mislabeled breaking patch release propagates to every project with a compatible range."],
    v: "Run an old client release against the current registry and a recent manifest, lockfile and archive set; resolution and install succeed, or the client reports a clear unsupported-version message instead of misbehaving.",
    dep: ["semantic-versioning","protocol-versioning","lockfile-format","manifest-validation"]
  },
  "scale-and-cost": {
    s: "The resource limits of a public ecosystem: bandwidth, storage that only grows, metadata size, request volume and the load every client's resolution puts on the registry.",
    d: "Popular packages are downloaded billions of times, and every install resolves against metadata. Bandwidth and storage dominate cost and are driven by CI systems that reinstall from scratch. Design choices such as sparse indexes, compact metadata, CDNs, client caches and the content-addressed store exist to move load off the registry. Abuse and scraping add load. It is hard because the costs of a free public good fall on a few operators while users have little reason to economize.",
    k: ["Free unlimited downloads versus rate limits and paid tiers: free access drives adoption, but sustained abuse and wasteful CI traffic are paid for by the operator.", "Caching at client and edge versus always fetching fresh: caches cut cost enormously, but add staleness and invalidation problems."],
    p: ["A popular CI configuration reinstalls from an empty cache on every run and drives a large share of registry traffic.", "A change in client behavior doubles request volume overnight and overloads the index."],
    v: "Measure requests and bytes for a cold install and a warm install of the same lockfile; the warm install transfers almost nothing, and a load test at ten times normal rate shows the registry still meeting its latency target.",
    dep: ["download-endpoints","sparse-index","http-cache","content-addressed-store","registry-storage"]
  },
  "failure-behavior": {
    s: "What the tool does when something is missing or wrong: registry down, hash mismatch, conflicting versions, failed script, partial cache. Fail closed or open, retry or stop, and what to tell the user.",
    d: "Every stage has failure modes: network errors, truncated downloads, tampered files, unsatisfiable constraints, scripts that fail and unsupported platforms. The policy is chosen per failure: integrity errors fail closed, transient network errors retry, optional dependencies fall back, and unknown protocol versions stop with a message. The tool must leave disk in a state the next run can repair and say which package and which step failed. It is hard because the quiet choices, such as skipping and continuing, hide problems for months.",
    k: ["Failing closed on verification errors versus warning and continuing: closed protects users, but a mirror bug or key expiry blocks everyone until fixed.", "Retrying automatically versus failing fast: retries hide transient problems, but delay clear diagnosis of permanent ones."],
    p: ["A tool that continues past a failed optional step reports success while the feature is silently absent.", "An error message that omits the package and step sends users to guess among hundreds of dependencies."],
    v: "Inject each failure into a test environment, such as a blocked registry, corrupted archive, expired key and failing script, and confirm each produces the documented behavior, a message naming package and step, and a tree the next run repairs.",
    dep: ["fetch-scheduler","integrity-hashes","conflict-explanation","install-scripts","optional-dependencies"]
  },
});
