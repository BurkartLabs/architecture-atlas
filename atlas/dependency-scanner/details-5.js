// Details for the dependency scanner plate, part 5: package metadata, execution and storage, cross-cutting concerns.
ATLAS.details("dependency-scanner", {
  "registry-client": {
    s: "Queries package registries for version lists, release dates, declared dependencies, yanked status and checksums, with authentication, retries and rate-limit handling.",
    d: "Each ecosystem has a registry with its own interface for listing releases and fetching metadata. The client wraps them behind one interface, handles credentials for private registries and mirrors, backs off on rate limits, and verifies checksums. Resolution, fixed-version checks, upgrade planning and license detection all call it. It is on the critical path of scans, so its latency and failures matter. Hard because registries are third-party services with outages and different guarantees, and because metadata can change after publication.",
    k: ["Query the registry live vs use a mirrored copy: live is current but couples scans to external uptime; a mirror is stable and may lag.", "Retry aggressively vs fail fast: retries hide blips, but amplify load during an outage and slow every scan."],
    p: ["A registry outage turns every scan into a failure when no cached metadata is allowed.", "Ignoring yanked status recommends an upgrade to a release the maintainers pulled."],
    v: "Fetch metadata for a package from a recorded registry fixture and confirm versions, dates and yanked flags match; simulate a rate-limit response and confirm backoff, then success without duplicate downloads.",
    dep: ["private-registry-config", "metadata-cache"]
  },
  "metadata-cache": {
    s: "A local store of registry responses and package metadata with explicit freshness rules, so repeated scans do not refetch unchanged data.",
    d: "Responses are cached by package and version with validators such as entity tags and timestamps. Immutable data, like the contents of a published release, can be kept indefinitely, while mutable data such as the list of versions needs short lifetimes. The cache is shared among workers and survives restarts, and is the main way scans stay fast and polite to registries. Hard because invalidation is subtle: a yanked version or a changed advisory must not be served from a stale entry, and a poisoned entry would affect every later scan.",
    k: ["Long lifetime for immutable data and short for mutable: matches how registries behave, but depends on classifying each field correctly.", "Shared cache across tenants vs per-tenant: shared is efficient for public data, while private package metadata must never cross tenants."],
    p: ["A stale version list hides a newly published fixed release, so the planner reports no fix.", "Caching metadata for private packages in a shared cache leaks internal package names between customers."],
    v: "Fetch a package twice and confirm the second read hits the cache; yank a version in the fixture and confirm the next version-list read reflects it within the configured lifetime.",
    dep: ["registry-client", "result-store"]
  },
  "provenance-signals": {
    s: "Signed statements and metadata about how a package or artifact was built and published, used to judge whether it came from the expected source.",
    d: "Registries and build systems can attach attestations: who published the release, from which repository and commit, with which build process, and whether the artifact hash matches. The scanner verifies the signatures, compares the claim to the expected source repository and turns the result into a signal on the component, or into a hard requirement in policy. It is the scanner's link to the supply-chain signing system. Hard because adoption is partial, most packages have none, and verification needs trust roots and key management.",
    k: ["Require provenance vs treat it as a positive signal: requiring gives strong guarantees but rejects most of the ecosystem; a signal gives credit without blocking.", "Verify offline against a bundled root vs online: offline is fast and available, online sees revocation."],
    p: ["Treating the absence of provenance as a failure for all packages produces thousands of unresolvable findings.", "Verifying a signature without checking it names the expected repository accepts a valid statement from the wrong source."],
    v: "Verify a package with a valid attestation naming the expected repository and confirm a positive signal; alter the claimed repository or the artifact hash and confirm verification fails with the reason.",
    dep: ["registry-client", "component-identity"]
  },
  "malicious-package-detection": {
    s: "Finds packages that are themselves attacks, such as typosquats, hijacked releases and those with install-time malware, which have no advisory-style vulnerability but must be treated as findings.",
    d: "Detection combines name similarity to popular packages, sudden maintainer or ownership changes, install-time scripts that fetch or run code, obfuscated or network-calling code in new releases and reports from researchers. Confirmed malicious versions are published as advisories and matched like any other. Unconfirmed signals produce lower-confidence warnings. It addresses a threat the advisory model does not cover. Hard because attackers adapt, behavior analysis needs sandboxes, and false positives block legitimate new packages.",
    k: ["Block on suspicion vs warn: blocking stops installs quickly, but a false positive halts an innocent developer; warnings may be ignored.", "Analyze new releases before developers install them vs after report: pre-analysis closes the window, but needs a delay and compute."],
    p: ["A malicious release lives for hours before anyone reports it, so only quarantine for new versions would catch it.", "Typosquat heuristics flag legitimate packages with names close to a popular one."],
    v: "Feed a known malicious release into the pipeline, confirm it is flagged with the signals that triggered, a project that depends on it fails the gate, and a legitimate similarly-named package is not blocked.",
    dep: ["registry-client", "maintenance-signals", "advisory-ingestion"]
  },
  "maintenance-signals": {
    s: "Indicators of whether a package is still maintained, such as release recency, deprecation notices, maintainer activity and responsiveness to past advisories.",
    d: "The collector reads registry metadata and repository activity to compute signals: last release date, deprecation status, archived repositories, time to fix earlier flaws and the number of maintainers. These support decisions the advisory database cannot: an abandoned package with no fix will stay vulnerable. Policy can warn on unmaintained dependencies and the upgrade planner can propose replacements. Hard because the signals are proxies: a stable library may be quiet because it is finished, and activity statistics are easy to inflate.",
    k: ["Report maintenance risk as a finding vs as context: a finding drives action, but flags stable and finished packages unfairly.", "Use repository activity vs registry data only: repository data is richer, but requires mapping the package to a repository correctly."],
    p: ["Flagging every package without a recent release as abandoned floods reports with stable libraries.", "A package mapped to the wrong repository inherits another project's activity and looks healthy."],
    v: "Compute signals for a deprecated package and an active one, and confirm the deprecated one is flagged with its deprecation notice, while an infrequently released but responsive package is not flagged abandoned.",
    dep: ["registry-client", "metadata-cache"]
  },
  "scan-scheduler": {
    s: "Decides when each project, image and environment is scanned, mixing event-driven scans on changes with periodic rescans, and spreading load over time.",
    d: "Triggers include commits, image pushes, deployments, new advisories and a periodic clock. The scheduler turns them into jobs, prioritizes interactive pull request scans over background rescans, and deduplicates requests for the same subject. When a new advisory arrives it targets only the inventories that contain the affected package rather than rescanning everything. Hard because the same event often fires many times, bursts follow major disclosures, and fairness among tenants must be maintained.",
    k: ["Rematch stored inventories on new advisories vs rescan sources: rematching is cheap and immediate, while rescanning also picks up changed source but is far costlier.", "Fixed periodic scans vs purely event-driven: periodic covers silent drift and costs compute, event-driven is efficient and can miss changes."],
    p: ["A flood of scans after a large advisory delays pull request feedback for every developer.", "Duplicate triggers for the same commit run the same scan many times."],
    v: "Publish an advisory affecting one package and confirm only projects containing that package are queued, in priority order after interactive scans, with duplicate triggers merged into one job.",
    dep: ["job-queue", "advisory-index", "result-store"]
  },
  "job-queue": {
    s: "Durable queues that hold scan work between producers and workers, with priorities, retries, rate limits and visibility into depth and age.",
    d: "Jobs carry the subject, requested scan type, tenant and priority. Workers lease jobs with a timeout, report completion or failure, and failed jobs retry with backoff and finally move to a dead-letter set for inspection. Separate queues for interactive and bulk work prevent starvation. It decouples the speed of requests from the speed of analysis. Hard because jobs vary from seconds to hours, workers crash mid-job, and the same job running twice must not produce duplicate results.",
    k: ["At-least-once delivery with idempotent jobs vs exactly-once claims: at-least-once is practical, and the work must tolerate duplicates.", "One queue per priority vs a single priority queue: separate queues isolate load, while one queue is simpler to operate."],
    p: ["Retrying a job that fails deterministically loops forever and starves the queue.", "A worker crash leaves a job leased until timeout, delaying results by the whole lease period."],
    v: "Kill a worker mid-job and confirm the job is picked up by another worker after the lease expires, produces exactly one stored result, and a permanently failing job lands in the dead-letter set after the retry limit.",
    dep: ["result-store"]
  },
  "scan-sandbox": {
    s: "An isolated, resource-limited environment where scans run, so that untrusted repositories, archives and images cannot harm the scanner or leak data.",
    d: "Workers run each job in a restricted container or virtual machine with no access to other tenants' data, limited network access, bounded CPU, memory, disk and time, and a clean filesystem. It handles hostile inputs: archive bombs, path traversal, malformed manifests, and code executed by build or resolution tools. Credentials are injected for the job and discarded. Hard because strict isolation makes caches and warm starts harder, and some analysis needs network access to registries.",
    k: ["Strong isolation per job vs shared long-lived workers: isolation contains compromise, at higher startup cost and with reduced cache reuse.", "No network vs allow-listed registries: no network is safest, but resolution and metadata fetch need some access."],
    p: ["A scan that executes project code on a shared worker lets one tenant read another's secrets.", "An unbounded decompression exhausts disk and takes down other jobs on the host."],
    v: "Scan a repository containing an archive bomb and a manifest that tries to read a file outside the job directory, and confirm the job is terminated at its limits with an error and no outside file is read.",
    dep: ["job-queue"]
  },
  "result-store": {
    s: "The durable store of scans, inventories, findings and decisions, keyed by subject and digest, serving dashboards, gates, diffs and re-matching.",
    d: "It stores each scan's inventory and the advisory snapshot used, the findings with their fingerprints, state changes such as suppressions, exceptions and closures, and the history over time. Queries range from the latest state for a gate to trends across an organization. Keeping inventories, not only findings, allows new advisories to be matched without rescanning. Hard because it grows without bound, must offer fast reads and consistent snapshots, and retention and deletion rules vary by customer.",
    k: ["Store inventories and recompute findings vs store findings only: inventories allow rematching and explanation, but need more storage and a matcher that stays reproducible.", "Append-only history vs mutable current state: history supports audit and trends, current state is smaller and quicker."],
    p: ["Storing only findings means a new advisory cannot be matched against past releases without rescanning them.", "Unbounded retention of every scan grows the store until queries slow down."],
    v: "Store a scan, publish a new advisory and confirm the finding is created from the stored inventory without rescanning; confirm the history shows both states and the advisory snapshot identifier used for each.",
    dep: ["dependency-graph", "finding-fingerprints"]
  },
  "incremental-scanning": {
    s: "Reuses prior work so that a scan of a mostly unchanged project or image only analyzes what is new, cutting time and cost.",
    d: "The scanner caches by content: layer digests for images, lockfile hashes for projects, and per-package analysis results. On a rescan it detects which inputs changed, reuses cached inventories and reruns only the delta, while matching always uses the current advisory snapshot. Pull request feedback in seconds depends on it. Hard because cache keys must capture every input that affects results, including tool and rule versions, or stale answers are served.",
    k: ["Cache by content digest vs by path and timestamp: digests are exact and portable, timestamps are cheap and unreliable.", "Cache inventories only vs cache findings too: inventories stay valid as advisories change; cached findings are faster but go stale."],
    p: ["A cache key that omits the scanner version serves results produced by buggy older logic.", "Caching findings across advisory updates hides newly published flaws in unchanged code."],
    v: "Scan an image, change one layer, and rescan; confirm only the changed layer is analyzed, the total time drops, and results equal a full scan on the same advisory snapshot.",
    dep: ["layer-extraction", "result-store", "lockfile-parsers"]
  },
  "multi-tenancy": {
    s: "Keeps each customer's or team's code, inventories, findings and configuration separated while sharing infrastructure and public data efficiently.",
    d: "Every record and job carries a tenant identity enforced at the data layer and in workers. Shared public data, such as the advisory index and public package metadata, is common; private inventories, private package names, policies and credentials are not. Quotas and fair queuing stop one tenant from consuming capacity. Hard because isolation failures are severe and subtle, caches and logs are shared by accident, and organizations need hierarchies of teams with inherited policy and delegated administration.",
    k: ["Row-level separation in shared stores vs separate stores per tenant: shared is efficient and depends on every query being filtered; separate is safer and costlier.", "Inherited policy through a hierarchy vs flat settings: inheritance gives central control, flat is simpler and harder to govern."],
    p: ["A cache key without a tenant identifier serves one customer's private package metadata to another.", "A policy change at the top of a hierarchy silently alters hundreds of teams' gate results."],
    v: "Create two tenants with a same-named private package and different policies, scan both, and confirm neither can read the other's findings, cache entries or logs, and each gate uses its own policy.",
    dep: ["result-store", "job-queue", "metadata-cache"]
  },
  "offline-mode": {
    s: "Lets scans run in environments with no internet access, using a signed advisory snapshot and mirrored metadata carried in, with clear reporting of how old that data is.",
    d: "Isolated networks, regulated sites and some build farms cannot reach feeds or registries. The scanner accepts a bundle of the advisory index and required metadata, verifies its signature, runs entirely locally and reports the snapshot date on every result. Updates arrive through a controlled transfer. It is the strictest test of the design: nothing may assume a network call. Hard because freshness is now an operational process, some features need live data, and users forget the snapshot is old.",
    k: ["Bundle the whole advisory index vs only relevant ecosystems: whole is simple and large, partial is small and fails on unexpected inputs.", "Fail when the snapshot is too old vs warn: failing forces updates, while warning keeps builds running on stale data."],
    p: ["A snapshot months old reports a clean result that is quietly false and nobody sees the date.", "Features that silently call out to the network fail or hang in an isolated environment."],
    v: "Disconnect the network, run a scan from a verified bundle and confirm findings and the snapshot date in the report; use a bundle past the age limit and confirm the configured warning or failure occurs.",
    dep: ["advisory-distribution", "advisory-index", "metadata-cache"]
  },
  "precision-vs-recall": {
    s: "The standing decision of how many false alerts to accept to avoid missing real vulnerabilities, made separately in matching, reachability, scoping and suppression.",
    d: "Every component faces it. Matching can include fuzzy identifiers and unbounded ranges, which finds more and raises false alerts; reachability can dismiss findings it cannot prove reachable, which removes noise and risks missed flaws. A missed vulnerability and a false alert have different costs for different audiences, and the costs move with the stage: early in the pipeline false alerts are tolerated, at a blocking gate they are not. Making the setting explicit, and showing confidence on each finding, lets users choose rather than guess.",
    k: ["Cautious by default vs quiet by default: cautious never hides a real flaw but trains people to ignore the tool; quiet is read but may mislead.", "One global setting vs per-stage settings: global is easy to explain, per-stage matches the cost of errors at each point."],
    p: ["Tuning only to reduce complaints gradually removes true findings and the loss is never measured.", "Reporting one accuracy figure hides that errors concentrate in certain ecosystems."],
    v: "Run the scanner on a labeled corpus of projects with known vulnerable and safe dependencies and report precision and recall per ecosystem and per stage, and confirm that changing a setting moves them as documented.",
    dep: ["match-engine", "static-reachability-query", "suppression-rules"]
  },
  "ecosystem-diversity": {
    s: "The fact that each package ecosystem has its own formats, naming, versions, resolution rules and registries, so every capability has to be built once per ecosystem.",
    d: "Parsing, resolution, version ordering, range grammar, metadata access, license conventions, advisory sources and even the meaning of a dependency scope differ. A scanner's quality is therefore a per-ecosystem matter, and support for a new ecosystem is a project touching nearly every layer. Designs that isolate ecosystem-specific logic behind adapters keep the core generic. Pretending ecosystems are alike gives wrong answers in the corners, while treating each as special multiplies maintenance.",
    k: ["Adapter interface per ecosystem vs a shared model with special cases: adapters isolate differences and need disciplined interfaces; special cases are quicker and spread everywhere.", "Broad shallow support vs a few ecosystems deeply: breadth covers more projects, depth gives accuracy and reachability."],
    p: ["Claiming support for an ecosystem when only manifest parsing exists leads users to trust results the scanner cannot back up.", "Fixing a bug in one ecosystem's version comparator and not noticing the same mistake in another."],
    v: "For each supported ecosystem run the conformance suite covering parsing, version ordering, resolution and advisory matching against the real package manager's outputs, and publish a support matrix stating what each does.",
    dep: ["ecosystem-version-parsers", "lockfile-parsers", "package-identity-matching"]
  },
  "data-freshness": {
    s: "How quickly new advisories, registry changes and corrections reach scan results, and how visible the age of the data is to the people relying on them.",
    d: "Between a flaw's public disclosure and a scanner flagging it there is a chain of delays: source publication, feed polling, normalization, index distribution, re-matching of stored inventories and notification. Each can be minutes or days. Freshness matters most for actively exploited flaws, and least for old ones. Designs that re-match stored inventories on arrival, push updates and stamp every result with the data snapshot give short, honest windows. Others hide the age of their data behind green results.",
    k: ["Push updates and re-match immediately vs scheduled batch refresh: immediate shortens exposure and costs compute and notification volume.", "Show snapshot age on every result vs only in settings: showing it keeps users aware, at the cost of clutter."],
    p: ["A scan is reported as clean while the advisory database is days behind, because the age is not shown.", "A source outage freezes updates silently and nothing alerts anyone."],
    v: "Publish a test advisory at a source and measure the time until a stored inventory produces a finding and a notification, and confirm the report shows the snapshot timestamp and an alert fires when a source has not updated within its expected interval.",
    dep: ["advisory-distribution", "scan-scheduler", "advisory-ingestion"]
  },
  "trust-in-inputs": {
    s: "The question of how far to trust each input: advisory publishers, registry metadata, supplied bills of materials, the scanned code itself and the scanner's own updates.",
    d: "Every input can be wrong or hostile. Advisory sources contain errors and disagree, registry metadata can be changed by a compromised account, suppliers' documents can omit components, repositories being scanned can contain archive bombs, and the scanner's own update channel is an attack path to every customer. Designs rank sources, record provenance on every fact, verify signatures, isolate execution and keep decisions explainable so a bad input can be traced and corrected.",
    k: ["Rank sources and record provenance vs treat all as equal: ranking resolves conflicts predictably, while equality needs no judgment and amplifies the worst source.", "Verify and sandbox everything vs trust internal inputs: universal verification costs effort, and internal inputs are where lateral attacks arrive."],
    p: ["A scanner that executes project code during resolution gives a malicious repository a foothold in the scanning infrastructure.", "An unsigned database update channel lets one compromised mirror blind every client."],
    v: "Feed the system a tampered advisory bundle, a repository with a hostile manifest and a supplied bill of materials missing a component, and confirm each is rejected, contained or flagged, with the source recorded in the decision.",
    dep: ["scan-sandbox", "advisory-distribution", "sbom-ingestion", "provenance-signals"]
  },
  "developer-experience": {
    s: "Whether people can understand a finding, trust it and fix it in the flow of their work, which decides if the scanner is used or routed around.",
    d: "Developers judge a scanner by its noise, speed and clarity: how fast the pull request check returns, whether each alert says which dependency path brought it in and what exact change fixes it, and whether the same issue is reported consistently in the editor, pipeline and dashboard. Tools that block builds with unexplained or irrelevant findings get disabled, exceptions pile up and real issues are lost. Investing in explanations, grouping, deltas and one-step fixes is a security measure, not a polish item.",
    k: ["Strict gate with fast exceptions vs lenient gate with reports: strict forces action but needs a quick, accountable way out; lenient is welcome and ignored.", "Fix suggestions in every finding vs findings only: suggestions cost data and compute and convert alerts into work that gets done."],
    p: ["A gate that fails with no path and no fix guidance gets bypassed rather than resolved.", "Different results in the editor and the pipeline for the same code make people distrust both."],
    v: "Observe developers fixing a seeded finding from the pull request check alone, and measure time from alert to merged fix and the share who need to ask for help, compared with a baseline of the previous release.",
    dep: ["pull-request-checks", "upgrade-planner", "risk-ranking", "duplicate-merging"]
  },
  "scale-and-cost": {
    s: "The compute, storage and network cost of scanning thousands of projects and images continuously, and the design choices that keep it proportional to what changed.",
    d: "Cost comes from repeated resolution against registries, unpacking large images, building call graphs, storing every inventory and re-matching after each advisory. Designs that cache by content, share public data across tenants, rematch stored inventories instead of rescanning, limit expensive analyses to findings that could matter and expire old data keep costs near linear in changes rather than in estate size. Poor designs get slower and more expensive as the organization grows, and then cut coverage to compensate.",
    k: ["Run expensive analysis on every finding vs only on high-priority ones: universal analysis is simple and costly; selective analysis needs a good first-stage filter.", "Retain full history vs summarize after a period: full history supports investigation, and summaries bound storage."],
    p: ["Rescanning the whole estate on every advisory causes load spikes exactly when fast answers are needed.", "Call graph analysis run on every pull request makes the check too slow to keep enabled."],
    v: "Measure cost and wall time per scan as estate size and change rate grow in a load test, and confirm cost tracks the number of changed inputs and new advisories, not the total number of projects.",
    dep: ["incremental-scanning", "scan-scheduler", "result-store", "metadata-cache"]
  },
});
