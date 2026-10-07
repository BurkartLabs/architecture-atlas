// Details for the package manager plate, part 3: fetching, install layout, scripts and builds.
ATLAS.details("package-manager", {
  "download-manager": {
    s: "Fetches package archives over HTTP, streaming each to disk while hashing it, and hands verified results to the store only once the hash matches.",
    d: "For each package the lockfile names, the manager checks the store first, then requests the archive from the registry or its mirror, streaming bytes through a hash computation into a temporary file. Only after the digest matches the recorded integrity value is the file moved into the store. Redirects, compression and range requests are handled here. It is hard because networks fail in the middle, because many small files need connection reuse and parallelism, and because a partial or tampered download must never become visible to later installs.",
    k: ["Hash while streaming versus after download: no second read of large files and early abort on mismatch, but code is more complex.", "Temporary file then atomic rename versus writing into place: a crash never leaves a partial entry, at the cost of extra disk space during the transfer."],
    p: ["A truncated download is accepted because only its length was checked, and a later install uses the broken archive.", "Following a redirect to an untrusted host sends the registry credentials along."],
    v: "Interrupt a download midway and rerun the install; the store contains no entry for the package until a complete archive with a matching hash is present, and a corrupted mirror response is rejected with a hash mismatch error.",
    dep: ["integrity-hashes","content-addressed-store","fetch-scheduler","download-endpoints","credential-storage"]
  },
  "fetch-scheduler": {
    s: "Runs many downloads and extractions in parallel under limits for connections, memory and disk, with retries and backoff for transient failures.",
    d: "Hundreds of archives may be needed, most of them small. The scheduler keeps a bounded number of requests in flight, reuses connections, orders fetches so dependencies of install scripts arrive early, and retries timeouts and server errors with exponential backoff and jitter. It honors rate-limit responses from the registry. It is hard because the best parallelism depends on network latency and disk speed, because retrying non-idempotent steps can duplicate work, and because failures must report which package and why.",
    k: ["High parallelism versus conservative limits: fast on good networks, but overloads weak ones and triggers registry rate limits.", "Retrying everything versus only known transient errors: resilient to flakiness, but repeated retries of a permanent error slow failure."],
    p: ["Thousands of simultaneous requests exhaust file descriptors or are throttled by the registry.", "A retry loop with no backoff turns a registry hiccup into a self-inflicted outage."],
    v: "Install a large tree against a test server that fails every tenth request; the install completes, logs the retries and never exceeds the configured connection limit, as shown by the server's connection count.",
    dep: ["download-manager","http-cache"]
  },
  "http-cache": {
    s: "Stores registry responses and archives with their validators so later requests are conditional, returning not-modified instead of re-sending bodies.",
    d: "The client stores each response with its entity tag and modification time and sends them back as conditional headers. A not-modified reply costs a round trip but no body. Cache-control directives from the registry or CDN set how long entries count as fresh. Immutable artifacts can be stored without revalidation. It is hard because the registry may serve different representations by content negotiation, because stale metadata can hide new releases, and because several processes share one cache directory.",
    k: ["Honoring server freshness hints versus a client-defined policy: servers know their update rates, while clients know whether the user wants offline speed.", "Revalidating metadata every time versus trusting recent entries: always correct but one round trip per package, against fewer requests with risk of staleness."],
    p: ["A proxy ignores validators and the client keeps serving an outdated index.", "Variants of the same URL, such as compact and full metadata, overwrite each other in the cache."],
    v: "Fetch a package's metadata twice with logging on; the second request carries a validator and receives a not-modified response with no body, and publishing a new version causes the next request to return the updated document.",
    dep: ["registry-metadata-api","compact-metadata","protocol-versioning"]
  },
  "package-archive-format": {
    s: "The container format that bundles a release's files, manifest and metadata into one compressed file, with rules for ordering, permissions and timestamps.",
    d: "A release is a compressed archive of files under a fixed top-level directory or none, containing the manifest and the files chosen by inclusion rules. Entries may carry permissions, and a metadata file can record build details. Normalizing ordering, timestamps and ownership makes the archive hash independent of the build machine. Some formats are zip-like with a central directory, others are streaming tarballs. It is hard because archive formats allow ambiguity, and different packers produce different bytes for the same files.",
    k: ["Streaming tar-style archives versus indexed zip-style: streaming compresses well and is simple to write, while indexed formats allow reading one file without unpacking all.", "Normalized timestamps and ordering versus preserving them: reproducible archive hashes, but file modification times are lost."],
    p: ["A packer records the build machine's owner and times, so two builds of the same source give different hashes.", "Two readers disagree about duplicate entries or odd paths and extract different files from one archive."],
    v: "Pack the same source tree on two machines and compare the archive hashes; they are identical. List the archive's entries and verify permissions and paths against the file list printed by the dry run.",
    dep: ["file-inclusion-rules","manifest-file","integrity-hashes"]
  },
  "archive-extraction": {
    s: "Unpacks an archive into the store or install directory while refusing paths, links and file types that could write outside the intended directory.",
    d: "Extraction iterates over entries, normalizes each path, rejects absolute paths and parent-directory components, and handles symbolic links and special files according to policy. Permissions are set from a safe mask rather than copied blindly. Size limits guard against decompression bombs. Case-insensitive file systems and reserved names add more rules. It is hard because the archive is attacker-controlled data and many past vulnerabilities came from a link entry followed by a file written through it.",
    k: ["Rejecting links in archives versus allowing them safely: rejecting removes a major attack class, but breaks packages that rely on links.", "Streaming extraction versus validating the whole archive first: streaming is fast and uses little memory, while pre-validation catches problems before any file is written."],
    p: ["An entry named with parent-directory components overwrites a file outside the package directory.", "A symbolic link entry followed by a regular file of the same path writes through the link to an arbitrary location."],
    v: "Extract a crafted archive containing parent-directory paths, an absolute path and a link-then-file sequence; the extractor refuses each, and a directory listing outside the target shows nothing was created.",
    dep: ["package-archive-format","download-manager"]
  },
  "content-addressed-store": {
    s: "A local directory where each package, or file, is kept under a name derived from its content hash, so identical content is stored once and shared by every project.",
    d: "Entries are keyed by the digest of the archive or of each file. Installs look up by hash, and link or copy from the store into project directories. Identical files across versions are stored once. Entries are immutable, so concurrent installs can share them without locks beyond atomic creation. An index maps package identity to its file list. It is hard because it must be corruption-evident, crash-safe, safe against hash collisions and shared across users and file systems.",
    k: ["Keying by archive hash versus by individual file hash: archive keys are simple, while per-file keys dedupe across versions at the cost of a larger index.", "A per-user store versus a machine-wide one: per-user is private and simple, while shared stores save disk but need careful permissions."],
    p: ["A store entry modified in place by a script affects every project that links to it.", "A store on a different file system from the project forces slow copies instead of links."],
    v: "Install the same package into two projects and confirm both reference one stored copy by inode or reflink; modify a stored file in a test and confirm integrity verification detects it on the next install.",
    dep: ["integrity-hashes","package-archive-format","file-linking-strategies"]
  },
  "store-garbage-collection": {
    s: "Removes cache and store entries no project references any longer, based on usage records or age, without breaking installs in progress.",
    d: "The store grows with every version ever installed. A prune command finds entries not referenced by any known project, or not used within a time window, and deletes them. Reference tracking can use a registry of project lockfiles, link counts or last-access times. It is hard because references live in directories the manager cannot enumerate, because pruning concurrent with an install can delete something just fetched, and because deleting an entry other tools expect forces another network round trip.",
    k: ["Age-based pruning versus reference-based: age is simple and needs no registry of projects, while references are exact but require tracking every project.", "Pruning on demand versus automatically: on-demand surprises nobody, but unattended machines slowly fill their disks."],
    p: ["Pruning removes entries needed by a project on an unmounted drive, which then cannot install offline.", "A prune that runs during another install deletes a package between its fetch and its link."],
    v: "Install a package in a project, delete the project, run prune, and confirm the store entry is removed and disk space is reclaimed; a project that still exists keeps its entries.",
    dep: ["content-addressed-store","file-linking-strategies"]
  },
  "vcs-and-url-fetchers": {
    s: "Fetchers for dependencies declared by repository or direct URL: clone at a revision or download an archive, then pack it like a release.",
    d: "For a repository source the fetcher resolves the named branch or tag to a commit, retrieves the files at that commit, runs the package's preparation steps if any, and produces an archive equivalent to a published one. For a URL it downloads and hashes the file. Results are cached by commit or hash. Credentials for private hosts come from the user's configuration. It is hard because hosts change protocols, because preparation steps execute code, and because nothing external guarantees the content behind a URL.",
    k: ["Full clone versus shallow fetch of a single revision: shallow saves time and space, but some hosts and revisions cannot be fetched that way.", "Running preparation steps during fetch versus requiring prebuilt sources: builds work out of the box, but arbitrary code runs before any verification."],
    p: ["A force-pushed branch makes a previously recorded commit disappear from the host and installs fail.", "A URL dependency serves a different file next week and, without a recorded hash, installs silently change."],
    v: "Depend on a repository by branch, install, and confirm the lockfile stores a full commit and archive hash; reinstall offline from the cache and confirm the same files are produced.",
    dep: ["download-manager","content-addressed-store","integrity-hashes","credential-storage","install-scripts"]
  },
  "install-planner": {
    s: "Compares the lockfile's wanted tree with what is on disk and produces the minimal ordered list of fetch, link, remove and run steps to reconcile them.",
    d: "The planner reads the previous install's state record and the wanted tree, computes added, removed and changed packages, orders operations so dependencies are ready before the scripts that need them, and skips untouched packages. The plan can be printed without executing. The state record makes repeated installs cheap. It is hard because the on-disk tree can be modified by users, because cycles need a deterministic order, and because the plan must stay valid if the process is killed between steps.",
    k: ["Keeping a state record versus inspecting the disk each time: a record is fast, while inspecting detects manual edits at the cost of reading many files.", "A dry-run plan separate from execution versus doing steps directly: plans can be reviewed and tested, but add a data structure to maintain."],
    p: ["A state record that says installed while files were deleted by hand leaves a broken tree the planner trusts.", "Operations ordered differently on two machines produce different outcomes for packages with scripts."],
    v: "Run install in dry-run mode before and after changing one dependency; the plan lists exactly the added, removed and changed packages, and a second dry run after executing lists no operations.",
    dep: ["lockfile","nested-layout","flat-layout","symlinked-layout","content-addressed-store"]
  },
  "nested-layout": {
    s: "A layout where each package's dependencies sit in a directory inside it, so every package sees exactly the versions it asked for, at the cost of duplication.",
    d: "Each package has its own dependency directory containing copies of what it needs, recursively. The module loader finds dependencies by walking up from the importing file, so each package sees its own version. This makes conflicts impossible, and layout trivially matches the graph. Without deduplication the tree grows enormous and deep paths hit operating system length limits. It is hard because duplicates of stateful libraries are loaded separately and, with no sharing, install time and disk both explode.",
    k: ["Full nesting versus flattening where versions agree: exact isolation and a simple algorithm, but heavy duplication and path length problems.", "Copies versus links into a shared store: copies are independent of the store, while links save space and time but expose shared files to modification."],
    p: ["Paths exceed the operating system limit on a deeply nested tree and extraction fails on one platform only.", "Dozens of copies of one library are loaded into memory by one application."],
    v: "Install a graph with a package at two versions and confirm each dependent's directory contains its own copy at the requested version; compute total size and compare it against a flattened install of the same lock.",
    dep: ["install-planner","deduplication-strategy"]
  },
  "flat-layout": {
    s: "A layout that hoists packages to the top-level dependency directory where possible, nesting only on version conflicts, which saves space but makes undeclared imports work by accident.",
    d: "The installer places one version of each package at the top and puts a conflicting version only inside the packages that need it. The loader's upward directory walk finds hoisted packages for everyone. This minimizes duplicates and path depth. The result depends on install order unless the algorithm is deterministic. It is hard because code can import packages it never declared simply because they were hoisted, and a harmless change elsewhere in the tree can make such an import stop working.",
    k: ["Hoisting versus strict isolation: hoisting is compatible with older loaders and saves space, but hides missing dependency declarations.", "Deterministic placement versus placement by install order: deterministic trees are reproducible, but the algorithm needs a global view of the graph."],
    p: ["A package imports an undeclared dependency that only works because a sibling hoisted it; removing the sibling breaks it.", "Different install orders give two developers different tree shapes and different bugs."],
    v: "Install a graph, then run a check that imports each package's declared dependencies only; confirm an undeclared import of a hoisted package is detected, and that two installs from the same lock yield identical tree layouts.",
    dep: ["install-planner","deduplication-strategy","lockfile"]
  },
  "symlinked-layout": {
    s: "A layout in which every package lives once in a shared directory and each project sees only its declared dependencies through symbolic links, preventing accidental imports.",
    d: "Packages are placed in a virtual store directory by name and version, with each package's own dependencies linked beside it. A project's top level contains links only to its direct dependencies. Because the loader resolves links to real paths, each package finds its dependencies as siblings and nothing undeclared. It is hard because tools that don't follow or normalize links misbehave, because links need special permissions on some systems, and because a package that expects to be a plain directory can break.",
    k: ["Strict symlinked layout versus hoisted layout: strict catches undeclared imports at once, but breaks tools that assumed the flat structure.", "Real-path resolution versus preserving link paths in the loader: real paths keep one instance per package, while preserved paths can load a copy twice."],
    p: ["A tool resolves a link to its real path and then cannot find the project's sibling configuration.", "Some operating systems restrict link creation to privileged users unless a special mode is enabled."],
    v: "Install into a project and list the top-level dependency directory; it contains links only for declared direct dependencies, and importing an undeclared package from project code fails while its declared ones load.",
    dep: ["install-planner","content-addressed-store","file-linking-strategies"]
  },
  "global-store-layout": {
    s: "One machine-wide directory of immutable package versions that many projects share, with each project's tree built from links into it.",
    d: "The store holds one directory per package version, and every project's dependency tree is assembled from links into it rather than copies. A new project install that finds everything in the store takes seconds. Some designs make the store the sole source of truth, with environments as named sets of versions. It is hard because stored files are shared mutable-looking data, because links cannot cross file systems, and because deletion and permissions are now machine-level concerns.",
    k: ["Machine-wide shared store versus per-project copies: large savings in disk and time, but one corrupted or modified file affects every project.", "Immutable read-only store files versus writable ones: protects shared content, but tools that write into their own directory fail."],
    p: ["A build script writes a generated file into its package directory, which is a link into the shared store.", "Two users on one machine cannot share the store because of file permissions."],
    v: "Install two projects needing the same package and confirm the store holds one directory for it; attempt to modify a file through a project path and confirm it either fails or is detected by the next integrity check.",
    dep: ["content-addressed-store","file-linking-strategies","install-planner"]
  },
  "file-linking-strategies": {
    s: "The method used to place stored files into a project: hard links, copy-on-write clones, symbolic links or plain copies, chosen by what the file system supports.",
    d: "The installer probes whether the store and project share a file system and whether it supports clones. Clones give copy semantics at link cost. Hard links share one inode, so edits show everywhere. Plain copies work everywhere but are slow. The chosen method is recorded and falls back automatically. It is hard because behavior differs by file system, because shared inodes allow one project to alter another's files, and because moving across file systems silently changes performance.",
    k: ["Clone then hard link then copy fallback versus one fixed method: best speed per environment, but behavior differs between machines.", "Hard links versus clones: both are instant, but clones keep edits private while hard links propagate them everywhere."],
    p: ["Editing a hard-linked file in one project's tree changes the same file in all other projects.", "A project on another drive silently falls back to copying and installs become tenfold slower."],
    v: "Install a package into two projects and compare inode numbers or reflink status; then write to a file in one project and confirm whether the other changes, matching the documented method.",
    dep: ["content-addressed-store"]
  },
  "binary-linking": {
    s: "Creates executable shims or links in a binary directory for commands declared by packages, so installed tools can be run by name from the project or from the shell.",
    d: "A package declares command names mapped to files. At install the manager creates a link or a small wrapper script for each in the project's binary directory, marks it executable, and on some platforms creates additional launcher files. Global installs place them in a directory on the user's path. Collisions between packages are resolved by policy. It is hard because shebang lines, line endings and permissions differ per platform, and because wrappers add an extra process and obscure error messages.",
    k: ["Symbolic links to the real file versus generated wrapper scripts: links are fast and exact, while wrappers work on platforms without links and can set environment variables.", "Failing on a name collision versus last installed wins: failure is explicit, while overwriting keeps installs moving but silently changes a command."],
    p: ["A script with carriage-return line endings in its first line fails to launch with a confusing missing-interpreter error.", "Two packages providing the same command name make the one that runs depend on install order."],
    v: "Install a package declaring a command and run it by name from a project script and from the shell after a global install; confirm exit codes and arguments pass through and the file is executable on each platform.",
    dep: ["install-planner","entry-points-and-exports","file-linking-strategies"]
  },
  "install-scripts": {
    s: "Commands that a package declares to run during installation, before or after files are placed, to compile, download or generate things.",
    d: "Lifecycle hooks run in a defined order around install, such as preinstall, install and postinstall, with the package directory as working directory and environment variables describing the context. The manager runs them in dependency order, sometimes in parallel, and fails the install if one exits nonzero. Registry packages' scripts run with the user's full permissions. It is hard because scripts are the main route for malware, break reproducibility, slow installs and require toolchains on every machine.",
    k: ["Running scripts by default versus disabled by default: default-on keeps native packages working, while default-off blocks the most common attack path at the cost of extra configuration.", "Hooks in manifests versus declared build steps with known effects: free-form hooks do anything, while declared steps can be audited and cached."],
    p: ["A compromised dependency's postinstall script reads credentials from the home directory and sends them out.", "A script that works on the author's machine fails on clean machines lacking a compiler or network access."],
    v: "Install a test package whose script writes a marker file to a location outside its directory; with scripts disabled no marker appears, and with scripts enabled the log shows the script ran in the expected order.",
    dep: ["script-sandboxing","install-planner","native-builds"]
  },
  "script-sandboxing": {
    s: "Limits what install scripts can read, write and reach, through allowlists of trusted packages, restricted file and network access, or running in isolated environments.",
    d: "The simplest control is an allowlist naming packages whose scripts may run; others are skipped. Stronger controls run each script in an isolated environment with a read-only view of the filesystem except its own directory, no network, no inherited credentials and a time limit. Scripts that are skipped are reported so the user can approve them. It is hard because legitimate scripts need compilers, network downloads and the host's headers, which are exactly the capabilities an attacker wants.",
    k: ["Package allowlist versus OS-level isolation: an allowlist is simple and portable, while isolation limits damage even from allowed packages but depends on platform features.", "Blocking network in scripts versus allowing it: blocking removes exfiltration and unpinned downloads, but breaks packages that fetch prebuilt binaries."],
    p: ["An allowlisted package is later compromised and its next release's script runs with full permissions.", "Skipped scripts are never reviewed and the package fails at runtime because its binary was never built."],
    v: "Install a package whose script attempts to read a file in the home directory and open a network connection; under the sandbox both attempts fail and are logged, and the install either fails clearly or marks the package unapproved.",
    dep: ["install-scripts","build-isolation","credential-storage"]
  },
  "native-builds": {
    s: "Compiling platform-specific code during installation by invoking the host toolchain, with the headers, libraries and flags the package asks for.",
    d: "A package with native code ships sources and a build description. At install the manager locates compilers and headers for the current platform and runtime version, runs the build, and places the output beside the package. Failures usually come from a missing toolchain or incompatible headers. Results can be cached by platform and version. It is hard because builds depend on host state the lockfile does not capture, take minutes, and produce different binaries on different machines.",
    k: ["Build from source on install versus ship prebuilt binaries only: source works on any platform with tools, while binaries install instantly but cover only prepared platforms.", "Using the host's libraries versus bundling them: smaller and shared with the system, but varies per machine."],
    p: ["A missing compiler produces a wall of errors from deep inside the build and the real cause is a single absent tool.", "Two machines with different system libraries produce binaries with different behavior from one lock."],
    v: "Install a native package on a machine with and without a toolchain; with it, the built binary loads and passes its self-test, and without it the error names the missing tool and the install fails or falls back to the prebuilt binary.",
    dep: ["build-dependencies","build-isolation","build-artifact-cache","prebuilt-binaries"]
  },
  "prebuilt-binaries": {
    s: "Compiled artifacts published for specific platform and runtime combinations, selected at install so most users never need a compiler.",
    d: "The publisher builds for a matrix of operating systems, processor families and runtime versions, and uploads each as a separate file or as a platform-tagged package. At install the client computes its own tags and picks the best match from the available files, or falls back to source. The binary's hash is checked like any archive. It is hard because the matrix is large, tags must match precisely, and users receive binaries nobody can inspect from source.",
    k: ["Platform-tagged files in one release versus separate per-platform packages: one release is simpler for authors, while separate packages let each platform's download stay small.", "Downloading binaries from a third-party host versus from the registry: external hosts avoid registry size limits, but add unvetted network trust."],
    p: ["An unusual platform matches no binary and silently falls back to a source build that fails.", "A binary downloaded from a separate host is replaced after publication, bypassing the registry's immutability."],
    v: "Install on each supported platform and confirm the selected file's tags match the machine, its hash matches the registry record, and on an unsupported platform the client reports the fallback path.",
    dep: ["package-archive-format","integrity-hashes","platform-specific-dependencies","registry-storage"]
  },
  "build-isolation": {
    s: "Runs package builds in a fresh temporary environment containing only declared build dependencies, so results do not depend on whatever the project or machine has installed.",
    d: "For a source package the manager creates a temporary environment, installs the declared build requirements into it, invokes the package's build backend through a standard interface, and collects the produced artifact. Environment variables are cleaned and the project's own packages are not visible. This makes builds reproducible and safe from tool clashes. It is hard because each build repeats an environment setup, because some packages secretly rely on global tools, and because the interface between manager and backend must stay stable.",
    k: ["Isolated build environments versus building in the project environment: isolation is reproducible and tidy, but slower and sometimes breaks packages needing project context.", "A standard backend interface versus invoking scripts directly: the interface allows any tool to build, but limits what special setups can express."],
    p: ["A build passes only because a globally installed tool happened to be present, and fails in clean CI.", "An isolated build downloads its tools each time because nothing is cached between runs."],
    v: "Build a source package on a machine lacking its tools globally; the manager provisions them in a temporary environment, produces an artifact, and deletes the environment, leaving the project tree untouched.",
    dep: ["build-dependencies","download-manager","content-addressed-store"]
  },
  "build-artifact-cache": {
    s: "Stores the outputs of compiled builds keyed by source hash, platform and toolchain, so the same build is not repeated on another install or machine.",
    d: "After a successful native build, the output is stored under a key combining the package's content hash, runtime version, platform and relevant environment. The next install with the same key links the stored output instead of compiling. Shared caches across CI machines multiply the benefit. It is hard because the key must capture everything that affects the output, including compiler version and flags, and because a wrong key serves a binary built for another environment.",
    k: ["A broad key including toolchain details versus a narrow one: broad keys are safe but hit less often, while narrow keys share more and risk wrong binaries.", "A local cache only versus one shared across a team: shared caches save build minutes, but need integrity checks and trust in every writer."],
    p: ["A cached binary built against one system library version is reused on a machine with an incompatible one.", "A poisoned shared cache serves a malicious binary for a trusted package hash."],
    v: "Build a native package, change nothing, delete the project tree and reinstall; the second install reports a cache hit and finishes without invoking the compiler, and changing the compiler version causes a miss.",
    dep: ["native-builds","content-addressed-store","integrity-hashes"]
  },
});
