// Details for the dependency scanner plate, part 4: manifest parsing, image scanning, advisory database.
ATLAS.details("dependency-scanner", {
  "manifest-parsers": {
    s: "Readers for the files in which authors declare their dependencies and version constraints, one per ecosystem format, producing the declared set before resolution.",
    d: "A manifest lists direct dependencies with constraints, scopes, optional groups, source overrides and sometimes build instructions. Each parser handles its format, which may be a data file, a script with logic, or a declarative document with includes. The output is the declared intent, used when no lockfile exists, to explain why a package is present and to plan upgrades. Hard because some manifests are executable programs whose real dependencies depend on evaluation, and many contain conditionals on platform or environment.",
    k: ["Parse statically vs execute the manifest: static is safe and fast but misses computed dependencies; execution is accurate but runs untrusted project code.", "Report all conditional dependencies vs only the current platform: all is complete but includes things that never install."],
    p: ["Executing a manifest from an untrusted repository to learn its dependencies runs the attacker's code.", "Conditional dependencies on other platforms are skipped, so a package installed only on one operating system never gets scanned."],
    v: "Parse a fixture manifest with direct, development, optional and conditional dependencies and confirm each is returned with its constraint and scope, and that no project code was executed.",
    dep: ["ecosystem-version-parsers", "range-grammars"]
  },
  "lockfile-parsers": {
    s: "Readers for the generated files that record the exact versions a resolver chose, the most reliable source of what will actually be installed.",
    d: "A lockfile lists every resolved package with its exact version, source location, integrity hash and the dependencies it was resolved with. Parsers handle each format and its versions, and some formats are not text, or reference packages by hash. Using the lockfile means the scan reflects the build, not a guess about it. Hard because formats change between tool versions, the same package can appear many times, lockfiles can disagree with the manifest, and a stale lockfile misdescribes reality.",
    k: ["Prefer lockfile to manifest when both exist: lockfile gives exact versions, but may be out of date with the manifest.", "Verify integrity hashes while parsing vs only read versions: verifying detects tampering and corruption, with extra work and noise."],
    p: ["A lockfile format version the parser does not know is skipped, and the project is reported clean.", "Scanning a stale lockfile that no longer matches the manifest reports versions that are not in the build."],
    v: "Parse lockfiles of each supported format version and confirm the package list and versions match the package manager's own listing command, and that an unsupported version produces an error, not an empty result.",
    dep: ["ecosystem-version-parsers", "component-identity"]
  },
  "workspace-handling": {
    s: "Understands repositories that hold many packages sharing one lockfile or resolution, so each project is scanned once with the right scope and boundaries.",
    d: "In a monorepo or workspace, a root file lists member packages, links between them, and often a single lockfile for the whole tree. The handler finds all members, treats internal links as local packages rather than registry ones, and attributes each external dependency to the members that use it. It avoids scanning the same lockfile once per member and avoids reporting internal packages as unknown. Hard because layouts vary widely, a single lockfile hides which member needs which dependency, and ownership and policy differ per member.",
    k: ["One project per repository vs per workspace member: per member gives accurate ownership, but requires attributing the shared lockfile.", "Detect workspaces automatically vs configure: automatic works with defaults, but misreads unusual layouts."],
    p: ["Scanning each member against the full shared lockfile reports every finding once per member and inflates counts.", "Internal packages with registry-like names are matched against external advisories."],
    v: "Scan a workspace with three members and a shared lockfile and confirm each member lists only its own dependency subset, internal packages are marked local, and totals match a single scan of the lockfile.",
    dep: ["manifest-parsers", "lockfile-parsers", "dependency-graph"]
  },
  "resolution-without-lockfile": {
    s: "Estimates the versions that would be installed when a project has only a manifest, by simulating the ecosystem's resolver against registry metadata.",
    d: "The resolver reads the manifest's constraints, fetches available versions and their declared dependencies from the registry, and applies the ecosystem's selection rule, typically the newest compatible version, to build a full tree. It supports scanning libraries and projects that do not commit lockfiles. Results are a prediction, since the real install happens later and may choose differently. Hard because reproducing a package manager's algorithm exactly is difficult, and the answer changes whenever new releases are published.",
    k: ["Simulate the resolver vs run the real package manager: simulation is safe and quick but can differ; running the tool is exact but executes project code.", "Report the predicted tree vs report constraints only: the tree enables matching, but is a guess presented as fact."],
    p: ["Presenting a predicted resolution as the installed set makes findings appear and vanish as releases are published.", "Resolver differences in peer or optional dependency handling produce a tree nobody ever installs."],
    v: "Resolve a manifest-only fixture and compare the versions to a real install performed the same day, and confirm they agree; confirm the report labels the result as predicted.",
    dep: ["manifest-parsers", "registry-client", "range-evaluation"]
  },
  "transitive-resolution": {
    s: "Expands direct dependencies into the full tree of indirect ones, choosing exactly one version per package where the ecosystem requires it and recording paths.",
    d: "Starting from the roots, the resolver walks each dependency's declared requirements, merges constraints, selects versions per the ecosystem's strategy and records parent edges. Some ecosystems allow several versions of a package side by side, others require a single one and fail on conflicts. When a lockfile exists this step is a read, otherwise a computation. Transitive packages are the majority of the inventory and of the findings. Hard because strategies and tie-breaking rules differ and decide which version of a shared dependency ends up shipped.",
    k: ["Allow multiple versions of one package vs force a single version: multiple avoids conflicts and bloats the tree; a single version is smaller and can make resolution impossible.", "Newest compatible vs oldest compatible selection: newest picks up fixes, oldest is more reproducible."],
    p: ["Assuming one version per package in an ecosystem that allows several misses the vulnerable copy that is also installed.", "Ignoring optional or peer edges drops packages that some environments install."],
    v: "Resolve a fixture where two parents need different versions of the same package, and confirm the output matches the real tool: both versions or the single chosen one, with each parent edge recorded.",
    dep: ["manifest-parsers", "lockfile-parsers", "range-evaluation"]
  },
  "private-registry-config": {
    s: "Reads and applies the configuration for internal registries, mirrors and authentication, so private packages resolve and are not confused with public ones of the same name.",
    d: "Projects specify registries by scope or by package, with credentials supplied through tokens or environment variables. The scanner reads this configuration, queries the correct source for each package and protects the credentials. It also has to decide how to treat private packages: they have no public advisories, but their names can collide with public packages. Hard because secrets must not leak into logs or reports, configuration is spread across files, and a mixed configuration is exactly the setup that enables dependency confusion.",
    k: ["Resolve private names only from the private registry vs search public too: private-only prevents confusion, public fallback finds more but is exploitable.", "Scanner holds credentials vs uses short-lived tokens from the pipeline: holding is simple, short-lived tokens limit damage if leaked."],
    p: ["A private package name also published publicly leads the scanner to match public advisories to unrelated internal code.", "Credentials printed in debug output are stored in scan logs."],
    v: "Scan a project with a scoped private registry and a public one, and confirm private packages resolve only from the private source, public advisories are not matched to them, and no token appears in logs.",
    dep: ["registry-client", "manifest-parsers"]
  },
  "build-time-capture": {
    s: "Records the dependencies a build actually used by observing the build itself, catching what static reading of files cannot see.",
    d: "Instead of inferring dependencies from files, a plugin or wrapper around the build records which packages were fetched or compiled, including those chosen by scripts, downloaded at build time or generated. The recording becomes an authoritative inventory of the artifact. It is the most accurate source for compiled languages and complex builds. Hard because it requires integrating with each build system, adds overhead and a failure mode to builds, and must be kept from capturing secrets or from being bypassed.",
    k: ["Observe the build vs read the files: observing is accurate but intrusive; reading is simple and misses dynamic behavior.", "Capture in the pipeline vs developer machines: the pipeline is authoritative, while local capture gives early feedback with environment differences."],
    p: ["A build step that downloads a dependency by URL escapes any manifest-based scan.", "A capture plugin that crashes the build gets removed by the team that is blocked by it."],
    v: "Run a build that fetches one dependency by script and confirm the captured inventory contains it with its hash while a manifest-only scan of the same repository does not.",
    dep: ["dependency-graph", "scan-sandbox"]
  },
  "image-registry-pull": {
    s: "Fetches an image's manifest and layers from a registry using the standard distribution protocol, with authentication, and verifies digests before analysis.",
    d: "The puller resolves a tag to a digest, downloads the manifest, its configuration and each layer blob, and checks that content hashes match. For multi-platform images it selects or iterates over each platform. Blobs are cached by digest, so shared layers are fetched once. It also reads image metadata like build history and labels. Hard because registries are rate limited and authenticated in varied ways, layers are large, and scanning a tag that changes between the pull and the report attributes results to the wrong content.",
    k: ["Scan by tag vs by digest: tags are what people name, but digests are the only stable identity of what was scanned.", "Pull full layers vs read selected files remotely: full pull is simple, selective reads save bandwidth for large images but need range requests."],
    p: ["Recording results against a mutable tag lets a different image later inherit a clean verdict.", "Pulling large images repeatedly without a digest cache exhausts registry rate limits."],
    v: "Scan an image by tag, move the tag to another image, and confirm the stored result is keyed to the first image's digest and a new scan is produced for the second.",
    dep: ["private-registry-config", "job-queue"]
  },
  "layer-extraction": {
    s: "Unpacks an image's stacked filesystem layers into the final view of files, applying deletions and overlays, while remembering which layer contributed each file.",
    d: "Each layer is an archive of changes. Extraction applies them in order, honoring whiteout markers that delete lower files, and builds a merged view while recording the layer of origin for each path. Scanners then analyze the merged view and attribute findings to layers. It must avoid writing archive paths outside the extraction root and avoid unpacking huge or malicious archives. Hard because of size and safety, and because the final view differs from the sum of layers: a file deleted in a later layer is not shipped but remains in the image.",
    k: ["Extract to disk vs inspect archives in memory: disk is simple and supports any tool, memory is faster and avoids temporary storage.", "Scan the merged view vs every layer: merged reflects what runs, while every layer finds things hidden by later deletion that remain in the image."],
    p: ["Archives with paths that traverse upward overwrite files outside the extraction directory.", "Ignoring whiteouts reports packages that were removed in a later layer as present."],
    v: "Extract an image where a later layer deletes a vulnerable package, and confirm the merged view lacks it, the layer inspection still shows it in the earlier layer, and no file was written outside the root.",
    dep: ["image-registry-pull", "scan-sandbox"]
  },
  "os-package-db-readers": {
    s: "Reads the system package databases inside an image or host to list installed operating-system packages with their versions and source packages.",
    d: "Each distribution family keeps an installed-package database in a known path and format, recording package name, version, architecture, source package and file ownership. The reader parses it directly from the extracted filesystem, without running the package tool. Source package names matter because advisories are filed against them, not the binary package. Hard because formats differ, distroless and minimal images may have partial or no databases, and packages installed by copying files leave no database entry.",
    k: ["Parse the database directly vs run the package tool in the image: parsing is safe and portable, running the tool is authoritative but executes image code.", "Map to source packages vs match binary names: source mapping aligns with distribution advisories; binary names are simpler and miss shared sources."],
    p: ["Matching advisories against binary package names misses flaws filed against the source package.", "Images with a stripped package database appear to have no system packages and so no findings."],
    v: "Scan an image with a known system package list and confirm the output equals the package tool's own list, including source package names, and that an image without a database is flagged as unassessable.",
    dep: ["layer-extraction", "epoch-and-revision", "component-identity"]
  },
  "language-packages-in-layers": {
    s: "Finds language-ecosystem packages inside an image by recognizing installed-package metadata and lockfiles in the filesystem, independent of the system package database.",
    d: "Cataloguers look in conventional locations for installed package metadata, lockfiles left in application directories, and bundled applications, and emit components with ecosystem identities. This covers everything the application installed itself. It also reads compiled binaries for embedded build information that records the modules linked into them. Hard because layouts are not standardized, packages vendored into an application have no metadata, and the same package found in two paths must be deduplicated or attributed correctly.",
    k: ["Scan the entire filesystem vs known locations: the whole filesystem finds odd installs, but is slow and produces false hits from test fixtures.", "Rely on installed metadata vs on lockfiles left behind: metadata reflects what is installed; lockfiles may describe a different build."],
    p: ["Test fixtures and documentation directories containing sample manifests produce findings for packages that are not installed.", "A statically linked binary with embedded modules is skipped because it has no metadata directory."],
    v: "Scan an image containing an application with installed packages, a copy in a fixture directory and a compiled binary with embedded module data, and confirm the installed set and binary modules are found and the fixture is excluded.",
    dep: ["layer-extraction", "component-identity", "lockfile-parsers"]
  },
  "base-image-attribution": {
    s: "Determines which findings come from the base image and which from the application layers, so the right team and the right fix, a base update or a code change, are chosen.",
    d: "Using layer history and digests, the attribution step identifies the parent image the build started from and marks every component with the layer that introduced it. Reports then split findings into inherited and own. It also checks whether a newer base image would remove findings, which turns many alerts into one recommended rebase. Hard because history can be stripped or squashed, a base can be identified only by comparing layer digests to known bases, and rebuilding on a newer base requires a rebuild pipeline.",
    k: ["Attribute by layer digest match vs by build metadata: digests are exact but need an index of known bases; metadata is easy to fake or absent.", "Recommend newest base vs smallest compatible: newest removes more findings, smallest limits behavior change."],
    p: ["Squashed images lose layer boundaries and every finding appears to belong to the application team.", "Recommending a base rebuild no one owns sends the finding to a queue that cannot act."],
    v: "Scan an image built on a known base and confirm findings from base layers are labeled inherited, application findings are labeled own, and a newer base listing shows how many findings it would remove.",
    dep: ["layer-extraction", "ownership-routing", "upgrade-planner"]
  },
  "runtime-inventory": {
    s: "Builds an inventory of what is actually running in an environment, by listing running workloads and their image digests, so scanning matches production rather than the registry.",
    d: "An agent or integration enumerates running containers, hosts and functions, records each one's image digest or package list and environment metadata such as exposure and namespace, and sends it to the platform. Findings are then attached to what runs, not just to what was built, and old running versions are visible. It supplies the context for prioritization. Hard because workloads change constantly, the agent needs privileged access, and scanning every host or container on a schedule is costly.",
    k: ["Agent in each environment vs read the orchestrator's API: an agent sees processes and files, while API reading is lighter and sees only declared state.", "Continuous scan of running systems vs scanning images in the registry: running scans find drift, registry scans are cheaper."],
    p: ["A workload running an old image that was removed from the registry has no scan and never appears in reports.", "An agent with broad privileges is itself a target and a source of operational incidents."],
    v: "Deploy a workload from a known image digest, and confirm it appears in the inventory with the digest, namespace and exposure, and that a finding on the image shows the running workloads affected.",
    dep: ["image-registry-pull", "result-store"]
  },
  "source-feed-adapters": {
    s: "One adapter per advisory publisher, each knowing that source's endpoint, format, update model and quirks, and delivering raw records to the pipeline.",
    d: "Publishers include ecosystem advisory databases, distribution trackers, vendor bulletins, project security pages and central numbering authorities. Each has its own format, access method and update behavior: full dumps, incremental feeds, per-record lookups, rate limits and licensing terms. The adapter fetches changes, tracks its position, and passes raw records onward unchanged. Hard because sources change formats without notice, go offline, and have different quality, so each adapter needs its own monitoring and tests.",
    k: ["Many specialized adapters vs one generic importer: specialized handles quirks and increases maintenance, generic fails on the first oddity.", "Pull on a schedule vs subscribe to push notifications: scheduled is simple and bounded, push is faster but rarer."],
    p: ["A silently changed feed format yields empty imports, and the database goes stale unnoticed.", "Ignoring a source's license terms on redistribution creates a legal problem for the offline bundles."],
    v: "Point an adapter at a recorded feed, confirm it ingests every record once, resumes from its saved position after a restart, and raises an alert when the feed returns zero records for longer than the expected interval.",
    dep: []
  },
  "advisory-ingestion": {
    s: "The pipeline that takes raw records from all sources, validates and stores them, tracks revisions, and triggers downstream re-matching when something changes.",
    d: "Raw records land in an immutable store, each with its source, fetch time and content hash. The pipeline validates structure, detects changed records, writes a new revision rather than overwriting, and publishes change events for the matcher and notification systems. Keeping the raw record lets operators reproduce any decision. It is hard to run reliably: sources arrive out of order, records are corrected repeatedly, volume bursts follow big disclosures, and a bad record must be quarantined rather than blocking the rest.",
    k: ["Keep every revision vs only the latest: revisions explain past results and allow audit, but need storage and a history model.", "Reject invalid records vs quarantine them: rejection keeps data clean, quarantine allows later repair without losing them."],
    p: ["Overwriting a corrected record in place makes earlier findings impossible to explain.", "One malformed record that aborts the batch stops all updates from that source."],
    v: "Ingest the same record twice with one range corrected, and confirm two revisions exist, a change event is emitted only for the second, and the first revision's content hash is unchanged.",
    dep: ["source-feed-adapters", "advisory-normalization"]
  },
  "advisory-normalization": {
    s: "Converts each source's record into one internal schema: identifiers, affected packages and ranges, fixed versions, severity, references and credit.",
    d: "Sources describe the same facts differently, so a mapper per source translates package naming, range notation and severity into the internal model, preserving the original text and the source's identity. It canonicalizes ecosystems and names, converts ranges to the interval event form and records what could not be mapped. The result is what the matcher reads. Hard because mapping errors are invisible until a scan is wrong, sources are ambiguous about whether a range is inclusive, and the mapper must be tested against many real records.",
    k: ["Lossless conversion keeping the original vs convert only: keeping the original allows remapping when a bug is found, but doubles storage.", "Source-specific mappers vs a common intermediate format: mappers handle quirks directly, and a common format reduces how many mappings exist."],
    p: ["A mapper that reads an exclusive upper bound as inclusive reports fixed versions as vulnerable for every advisory from that source.", "Unmapped fields are dropped without a record, so data loss is not noticed."],
    v: "Normalize a sample of records from each source and compare to hand-checked expected output for affected ranges, fixed versions and identifiers, with any field the mapper could not handle listed in a report.",
    dep: ["source-feed-adapters", "range-grammars", "version-normalization"]
  },
  "advisory-deduplication": {
    s: "Combines records from different sources about the same flaw into one merged advisory, choosing which source wins for each field and keeping the provenance.",
    d: "Using alias links and affected package matches, the merger groups records and builds a single advisory. For each field it applies a source preference: for example the ecosystem database for ranges, the distribution tracker for system package fixes and the central authority for the description. Differences are kept as alternatives for audit. Hard because sources disagree, sometimes materially on affected ranges, and a wrong merge propagates to every scan, so the decision rules must be explicit and reviewable.",
    k: ["Field-level source precedence vs choose one whole record: field-level uses each source's strength and is harder to explain; whole-record is simple and discards better data.", "Union of affected ranges vs intersection: union maximizes recall with more false alerts, intersection is quiet and misses."],
    p: ["Merging by identifier alone combines records for different packages that share a flaw number.", "A source with a systematic error always wins a field because of a precedence rule nobody revisited."],
    v: "Merge three records for one flaw with conflicting ranges and confirm the output uses the documented precedence for each field and lists the discarded alternatives with their sources.",
    dep: ["alias-resolution", "advisory-normalization"]
  },
  "advisory-index": {
    s: "The queryable store of merged advisories, organized for the match engine's lookups by ecosystem and package name and for reverse lookups by flaw.",
    d: "The index keys advisories by normalized package identity so a lookup for one component returns its candidate advisories in microseconds, and keeps secondary indexes by flaw identifier, date and source. It serves the scanning path, which is read-heavy, and is rebuilt or incrementally updated from ingestion. It is versioned so a scan can state which snapshot it used. Hard because it must be consistent while updating, small enough to ship in offline bundles, and fast enough to match very large inventories.",
    k: ["Embedded snapshot file vs central database: a snapshot is fast, portable and offline-friendly, while a database allows instant updates and shared use.", "Full rebuild vs incremental update: rebuild is simple and consistent, incremental is quick and has more states to get wrong."],
    p: ["Updating the index in place during a scan mixes old and new advisories within one report.", "A snapshot with no version stamp makes it impossible to say which data produced a result."],
    v: "Query the index for a package with known advisories and confirm the set equals the merged data, the snapshot identifier is returned, and an update during a long scan does not change that scan's results.",
    dep: ["advisory-deduplication", "advisory-normalization"]
  },
  "advisory-distribution": {
    s: "Publishes the advisory index to scanners, as signed incremental updates or full snapshots, so clients stay current without refetching everything.",
    d: "Clients ask for changes since their last snapshot and receive a compact delta or a new bundle, with a signature they verify before use. Distribution has to scale to many clients and many pipelines pulling at once, so it uses content delivery and caching. It controls how fresh scans can be. Hard because bundles must be consistent and authentic, deltas must be applicable to any prior state, and a compromised or truncated update would blind every scanner at once.",
    k: ["Delta updates vs full bundles: deltas save bandwidth and need base-version tracking; full bundles are simple and large.", "Signed bundles with a trusted key vs transport security only: signatures protect against a compromised mirror, but require key management and rotation."],
    p: ["Accepting an unsigned or stale bundle lets an attacker serve an old database that omits a new flaw.", "Clients with a very old snapshot cannot apply deltas and silently keep scanning with stale data."],
    v: "Apply an update to a client and confirm the signature check, the new snapshot version and the new advisory in a scan; tamper with the bundle and confirm it is rejected and the old data is kept with a warning.",
    dep: ["advisory-index", "provenance-signals"]
  },
  "withdrawal-handling": {
    s: "Processes advisories that are retracted, rejected or corrected after publication, so false findings stop appearing and past reports can be amended.",
    d: "Sources mark records withdrawn, disputed, rejected as duplicates, or narrow their affected ranges. The pipeline records the withdrawal as a new revision, propagates it to the index, and re-evaluates stored findings, closing those that no longer apply with an explanation. Without it, a bad advisory keeps producing alerts forever. Hard because withdrawals arrive from only some sources, a disputed advisory has no clean state, and customers need to know a finding was closed because the data changed.",
    k: ["Close findings automatically on withdrawal vs flag for review: automatic removes noise, but a mistaken withdrawal then hides a real flaw.", "Keep withdrawn advisories queryable vs delete: keeping preserves audit trails and history."],
    p: ["Ignoring withdrawals leaves developers fixing flaws that do not exist and teaches them the tool cries wolf.", "Treating a disputed advisory as withdrawn drops a real flaw that a vendor merely disagrees about."],
    v: "Withdraw an advisory in the source, run ingestion, and confirm that existing findings close with a note citing the withdrawal revision, and that the advisory remains retrievable as withdrawn.",
    dep: ["advisory-ingestion", "result-store", "match-engine"]
  },
});
