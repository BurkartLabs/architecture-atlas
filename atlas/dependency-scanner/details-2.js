// Details for the dependency scanner plate, part 2: scoring, noise reduction, advisory matching.
ATLAS.details("dependency-scanner", {
  "base-severity-score": {
    s: "A standardized numeric rating of a flaw's intrinsic severity, computed from attack vector, complexity, privileges and impact, independent of any particular deployment.",
    d: "Publishers attach a score and vector string to an advisory using an open scoring standard. The scanner stores the vector, not just the number, so it can recompute under a newer version or adjust metrics. Base scores give a common vocabulary across sources and drive default thresholds. They are hard to rely on: different publishers score the same flaw differently, scores for a library flaw assume the worst use, and many advisories arrive without one so the scanner must choose between a vendor score, a distribution score or its own.",
    k: ["Use the highest published score vs a ranked source order: highest is cautious but inflates; ranked sources are predictable but may use a stale or generous publisher.", "Store the vector vs only the number: the vector allows recalculation and explanation, at the cost of handling several scoring versions."],
    p: ["Treating a worst-case library score as the score for this application's use overstates risk.", "Mixing scores from different versions of the scoring standard in one ranking compares unlike numbers."],
    v: "Ingest two advisories for one flaw with different scores and confirm the scanner shows the chosen score, the source it came from, and the vector, per the documented source order.",
    dep: ["advisory-normalization"]
  },
  "exploit-prediction": {
    s: "A probability estimate that a vulnerability will be exploited in the near term, derived from observed attack data and flaw characteristics, used to rank beyond severity.",
    d: "A published model produces a daily probability per advisory using signals such as exploit code availability, mentions in threat intelligence, flaw type and age. The scanner joins the score to findings and may sort or threshold by it. Because only a small fraction of flaws are ever exploited, probability separates urgent from merely severe. It is hard because it is a statistical estimate, not a fact: it lags new flaws, changes daily, is global rather than specific to the product and says nothing about whether the code is reachable.",
    k: ["Rank by exploit probability vs by severity: probability focuses effort on likely attacks, but new flaws score low until evidence accumulates.", "Snapshot score at detection vs live score: a snapshot is stable for reporting, a live value reacts to new exploit evidence."],
    p: ["A very new critical flaw with no data yet scores near zero and is deprioritized just when it is most dangerous.", "Scores that change daily make a gate flap between pass and fail without any code change."],
    v: "Load the daily probability data, then confirm a finding with a high probability sorts above a higher-severity finding with a near-zero one, and the finding shows the score's date.",
    dep: ["advisory-ingestion", "risk-ranking"]
  },
  "known-exploited-catalog": {
    s: "A curated list of vulnerabilities confirmed to be exploited in real attacks, used as a strong signal that a finding needs immediate attention.",
    d: "Government and industry bodies publish catalogs of flaws with confirmed in-the-wild exploitation, often with due dates for remediation. The scanner syncs the list, flags matching findings and lets policy treat membership as an override of ordinary severity ordering. It is a small, high-confidence set, so a hit is meaningful. Hard because coverage is partial and biased toward widely deployed products: absence from the list does not mean safe, and entries are keyed by flaw identifier, which must be mapped to the right package versions.",
    k: ["Membership as an automatic block vs as a priority boost: automatic blocking reflects real attacks, but may halt builds for components never exposed.", "Single catalog vs several sources: more sources raise coverage, with extra reconciliation and conflicting claims."],
    p: ["Reading absence from the catalog as evidence of safety ignores that the list covers only what was observed and reported.", "Mapping by identifier alone flags every package that vendors the same flaw, including patched ones."],
    v: "Add a flaw identifier to the synced catalog and confirm a finding for it becomes flagged as exploited, moves to the top of the ranking, and the policy action changes, with the catalog date shown.",
    dep: ["advisory-ingestion", "alias-resolution"]
  },
  "environmental-context": {
    s: "Adjusts a finding's priority using facts about how and where the component runs: exposure to the internet, privileges, data handled and compensating controls.",
    d: "Context comes from deployment metadata, network exposure scans, service catalogs and runtime inventory. A flaw in a parser reachable from the public internet is not the same as the same flaw in a batch tool on an isolated network. The scanner applies modifiers, such as the environmental metrics of the scoring standard, to move findings up or down. It is hard because the facts are in other systems, change often and are frequently wrong or missing, and each adjustment is a claim the scanner now makes and must be able to justify.",
    k: ["Automatic adjustment vs human-set tags: automatic stays current but depends on accurate integrations; tags are simple but go stale.", "Lower priority on mitigated findings vs leave unchanged: lowering reduces noise, but compensating controls fail and the finding is then forgotten."],
    p: ["Downgrading findings because a firewall is assumed to exist removes them from view when the assumption fails.", "Missing context treated as lowest risk instead of unknown quietly hides internet-facing services."],
    v: "Mark one deployment as internet-facing and another as isolated, scan both with the same dependency, and confirm the finding ranks higher for the first and the report names the context used.",
    dep: ["asset-criticality", "runtime-inventory", "base-severity-score"]
  },
  "asset-criticality": {
    s: "A rating of how important each application or data store is to the business, used so the same flaw is treated more urgently where more is at stake.",
    d: "Criticality is assigned from tiering schemes, service catalogs or data classification and attached to projects. It scales priority, deadlines and gate strictness: a flaw in a payment service gets a shorter deadline than one in an internal tool. It lets limited fixing capacity go where damage would be greatest. It is hard because the ratings are human judgments, often out of date, and teams have incentives to rate their own systems low to avoid obligations or high to get attention.",
    k: ["Coarse tiers vs a continuous score: tiers are easy to assign and explain, but a continuous score allows finer ranking with more disputed inputs.", "Central assignment vs team self-assignment: central is consistent, but self-assignment reflects who knows the system."],
    p: ["Untiered projects default to the lowest tier and the highest-risk ones are missed until an incident.", "Teams rating their own systems to avoid deadlines make tiers unreliable without review."],
    v: "Assign a high tier to one project and low to another with the same finding and confirm the deadline and gate behavior differ as policy specifies, and that an unassigned project is listed as unrated.",
    dep: ["ownership-routing", "sla-tracking"]
  },
  "risk-ranking": {
    s: "Combines severity, exploit evidence, reachability, context and age into one ordered list, so the first items are the ones most worth fixing now.",
    d: "A ranking function takes each finding's signals and produces a score or ordered bucket. Simple versions are rules, such as known-exploited first, then reachable critical, then others; more elaborate ones are weighted models. Output feeds dashboards, tickets and gates. It exists because fixing capacity is the constraint. Hard because the combination is a judgment: weights are arguable, inputs have different reliability, and a ranking people cannot explain is not trusted, so each result should expose the signals that placed it.",
    k: ["Transparent rules vs learned weighting: rules can be explained and audited, while a model can find combinations but is hard to defend to a team.", "Stable ordering vs live re-ranking: stable lists let people plan, while live ranking reacts to new exploit evidence."],
    p: ["An opaque score that nobody can explain gets overridden by whichever engineer shouts loudest.", "Constantly shifting ranks make quarterly planning and deadline tracking meaningless."],
    v: "Construct four findings differing in one signal each and confirm the ranking order matches the documented rules, with each result listing the signals that determined its position.",
    dep: ["base-severity-score", "exploit-prediction", "known-exploited-catalog", "static-reachability-query", "environmental-context"]
  },
  "suppression-rules": {
    s: "Declarative rules that hide specific findings, packages or paths from reports with a recorded reason, so known non-issues do not keep appearing.",
    d: "A rule matches on advisory, package, version, path or project and sets a state such as ignored or accepted. Unlike an exception it does not claim risk is acceptable, it records that the finding is not relevant, for example because the vulnerable feature is disabled. Rules live with the code or in the platform and are applied after matching. They are hard to keep honest: broad rules hide new problems, a reason that was true once becomes false after a refactor, and rules multiply until nobody knows what is hidden.",
    k: ["Suppress by advisory and path vs by package: precise rules rarely hide the wrong thing, but need more upkeep as paths change.", "Rules expire automatically vs persist: expiry forces re-justification, while persistent rules reduce churn but rot."],
    p: ["A suppression for a package silently covers later advisories for the same package.", "Hidden findings never appear in any count, so the amount of suppressed risk is invisible to management."],
    v: "Add a suppression for one finding with a reason, confirm it disappears from default output and appears in a suppressed list with the reason, and that a different advisory on the same package still shows.",
    dep: ["finding-fingerprints", "policy-language"]
  },
  "vex-statements": {
    s: "Machine-readable statements from a supplier or the project that say whether a product is actually affected by a given vulnerability, and why, so scanners can drop non-applicable matches.",
    d: "A statement identifies a product, a vulnerability and a status such as not affected, affected, fixed or under investigation, with a justification like the vulnerable code not being present or not reachable. Scanners consume them from suppliers and generate their own for downstream users. They turn expert analysis into data that travels with the product. Hard because of trust and scope: a statement is only as good as its author, must be tied to specific versions and components, and consumers need a policy for which authors they accept.",
    k: ["Accept supplier statements automatically vs review them: automation removes work, but trusts an author whose incentive is to say not affected.", "Statements tied to a component identity vs to a product version: component identity is exact, but requires stable identifiers to be present in both documents."],
    p: ["A statement that says not affected without a machine-checkable justification cannot be verified and may simply be wrong.", "Statements not re-evaluated after an upgrade keep suppressing findings for code that changed."],
    v: "Import a statement marking one finding not affected for a given component version and confirm it is suppressed with the author and justification recorded, and reappears when the component version changes.",
    dep: ["component-identity", "sbom-formats", "suppression-rules"]
  },
  "duplicate-merging": {
    s: "Collapses findings that describe the same underlying problem, arising from several paths to the same package, multiple aliases for one flaw or repeated scans, into one actionable item.",
    d: "A single vulnerable package may be reachable through a dozen dependency paths, listed under several advisory identifiers, in many projects, and in both source and image scans. Merging groups by flaw and component and keeps the paths as evidence. The unit of work becomes one fix rather than many alerts. It is hard because grouping too much hides distinct fixes, for example two versions of one package in different services, while grouping too little leaves the noise that merging is meant to remove.",
    k: ["Group by flaw and component version vs by flaw only: version grouping maps to a single fix, while flaw-only grouping is shorter but spans unrelated upgrades.", "Merge across projects vs within a project: cross-project views show organizational scope, but ownership and deadlines differ per project."],
    p: ["Merging across different versions of one package makes it unclear which fix applies to which service.", "Counting merged items as one hides how widely a flaw is spread when reporting exposure."],
    v: "Scan a project where one vulnerable package arrives through three paths and two advisory aliases, and confirm one finding appears with three paths and both identifiers listed.",
    dep: ["alias-resolution", "dependency-graph", "finding-fingerprints"]
  },
  "dev-vs-runtime-scoping": {
    s: "Distinguishes dependencies used only to build, test or lint from those shipped and executed in production, so findings in the former are ranked lower or excluded.",
    d: "Manifests and lockfiles label dependencies as runtime, development, optional, peer or build-only, in ecosystem-specific ways. The scanner records the scope on each graph edge and component, then propagates it: a package is runtime if any runtime path reaches it. Policy can ignore or demote development-only findings. It removes a large share of alerts for tools that never run in production. Hard because labels are inconsistent, a build tool can inject code into the artifact, and a dev dependency in one project is a runtime dependency of another.",
    k: ["Exclude development scope vs demote it: excluding reduces noise, but build-time compromise is a real attack path that a demotion still reports.", "Trust declared scope vs infer from usage: declared scope is cheap but sometimes wrong, while inference needs build analysis."],
    p: ["Ignoring all development dependencies misses vulnerabilities in tools that run in the build and can alter the shipped artifact.", "A package listed as development in one project and shipped by a consumer is wrongly classified when scanned in isolation."],
    v: "Scan a project with the same vulnerable package once as a development dependency and once as runtime, and confirm the scope appears on each finding and the development one is demoted per policy.",
    dep: ["dependency-graph", "manifest-parsers", "lockfile-parsers"]
  },
  "finding-fingerprints": {
    s: "A stable identifier for a finding, derived from the advisory, component and location, so the same problem is recognized across scans and its history is preserved.",
    d: "Each finding gets a key built from fields that identify the problem and not the incidental run: advisory identifier, component identity, the manifest or layer where it lives, and sometimes the dependency path. Suppressions, exceptions, tickets and trend history attach to the fingerprint. Without it, every scan produces new findings and nothing can be tracked. It is hard because the right fields are a trade-off: too specific and a path change creates a new finding, too general and distinct problems merge and share a waiver.",
    k: ["Include dependency path in the key vs exclude it: including it keeps paths distinct, but a refactor of unrelated packages changes the key and loses history.", "Content-derived keys vs assigned identifiers: derived keys need no state and are reproducible, assigned ones survive field changes but need a store."],
    p: ["A fingerprint that includes a file path loses all history when a directory is renamed.", "A fingerprint that is too coarse lets one exception cover two different vulnerabilities."],
    v: "Scan the same project twice and confirm identical fingerprints; rename the directory holding the manifest and confirm the finding keeps its fingerprint, exception and age.",
    dep: ["component-identity", "alias-resolution"]
  },
  "baseline-diffing": {
    s: "Compares current findings with a recorded earlier state so reports and gates can focus on what is new, fixed or changed since a chosen baseline.",
    d: "A baseline is a stored result, such as the default branch at a commit, a release, or the previous scan. The diff matches findings by fingerprint and reports added, removed and unchanged sets. It lets a team adopt scanning on an old codebase without a wall of historical findings: the gate blocks only new risk while old debt is tracked separately. It is hard because it needs reliable fingerprints and a trustworthy baseline: a stale baseline reports old problems as new, and a baseline taken too casually becomes a permanent amnesty.",
    k: ["Gate on new findings only vs on all findings: new-only enables adoption on legacy code, but lets existing risk persist indefinitely.", "Baseline as the target branch vs as a named release: the branch tracks reality, the release gives a stable reference to measure change against."],
    p: ["A baseline never refreshed turns the debt it captured into permanently accepted risk.", "Advisories published after the baseline appear as new findings even though the code did not change, confusing authors."],
    v: "Record a baseline, add one dependency with a known advisory and publish a new advisory against an old one, and confirm the diff reports both as added with different reasons: code change and database change.",
    dep: ["finding-fingerprints", "result-store"]
  },
  "package-identity-matching": {
    s: "Decides whether an advisory's affected package is the same thing as a component in the inventory, accounting for ecosystem, name normalization, namespaces and renamed or forked packages.",
    d: "Advisories name packages in the registry's own terms: ecosystem plus name, sometimes with a namespace. The inventory records what the project declared. Matching normalizes case, separators and scopes according to each ecosystem's rules, then compares exactly. It is the step where false matches and misses are born. Hard because names are not unique across ecosystems, the same code is republished under other names, and identifier-based sources describe products rather than packages, forcing fuzzy mapping.",
    k: ["Exact ecosystem-qualified match vs fuzzy matching: exact avoids false alerts but misses renamed or republished copies; fuzzy finds more with more mistakes.", "Normalize at ingestion vs at match time: ingestion is faster, but needs a re-ingest when normalization rules are fixed."],
    p: ["Matching by name alone across ecosystems flags an unrelated package that happens to share the name.", "Inconsistent normalization of case and separators makes a known-vulnerable package invisible."],
    v: "Scan inventories containing a package spelled with different case and separators, and an unrelated same-named package in another ecosystem, and confirm only the true package matches the advisory.",
    dep: ["component-identity", "version-normalization", "advisory-index"]
  },
  "purl-and-cpe-mapping": {
    s: "Translates between the package URL identifiers used by package-oriented advisories and the product identifiers used by older catalogs, so both kinds of source can match the same component.",
    d: "Package-oriented sources use a package URL naming type, namespace, name and version. Older catalogs use product-and-vendor identifiers from a dictionary that does not map one to one onto packages. The scanner keeps a mapping table, built from curated data and heuristics, that links a component to the identifiers under which advisories might be filed. It extends coverage to flaws only published under product names. It is hard because the mapping is lossy: one product can span many packages, and heuristic matches create many false positives.",
    k: ["Curated mapping vs heuristic mapping: curated is accurate but covers only what someone maintained; heuristics scale but generate noise.", "Match via product identifiers by default vs opt-in: default broadens recall, but is the largest source of false alerts."],
    p: ["Heuristic product matching flags a library for a flaw in an unrelated product with a similar name.", "Version ranges in product identifiers use a different structure and may be evaluated with the wrong comparator."],
    v: "Scan a component that has an advisory only under a product identifier, confirm the mapping surfaces it with a lower confidence label, and confirm an unmapped lookalike component does not match.",
    dep: ["component-identity", "advisory-normalization", "package-identity-matching"]
  },
  "range-evaluation": {
    s: "Tests whether a concrete version falls inside an advisory's affected ranges, using the ecosystem's own ordering and the range's inclusive and exclusive bounds.",
    d: "An advisory describes affected versions as ranges, lists of introduced and fixed versions, or explicit version lists. Evaluation parses each bound, orders it relative to the component's version with the ecosystem comparator and checks all intervals. Multiple branches of a project can each have a fixed version, so the list is a set of intervals, not one range. It is the arithmetic of the product. Hard because errors are silent: an off-by-one bound, a pre-release treated as older than its release or an unbounded interval gives a wrong verdict with no error.",
    k: ["Interval events (introduced, fixed) vs textual range strings: events are unambiguous and machine-friendly, while strings need ecosystem-specific parsing.", "Treat unknown versions as affected vs unaffected: affected is safe but noisy, unaffected is quiet but unsafe."],
    p: ["Treating the fixed version as inclusive reports the patched release as still vulnerable.", "A backported fix on an older branch is missed when only one global fixed version is stored."],
    v: "Run a table of versions at, just below and just above each bound of a multi-branch advisory and confirm the verdicts match a hand-written truth table for every case, including pre-releases.",
    dep: ["ecosystem-version-parsers", "range-grammars", "prerelease-ordering"]
  },
  "match-engine": {
    s: "Joins the inventory against the advisory index and returns every applicable finding with its evidence, evaluated quickly across thousands of components.",
    d: "For each component the engine looks up candidate advisories by normalized identity, evaluates ranges, applies source preferences and platform-specific rules, and emits findings with the matched advisory, version, fixed versions and confidence. The hot path is a keyed lookup, so it scales to large inventories, and reruns when either the inventory or the advisories change. It is hard to keep correct as inputs evolve: a rule fix changes results for old scans, and explaining why something matched requires retaining the evidence, not just the verdict.",
    k: ["Match on scan vs precompute reverse index: matching at scan time is simple, but re-matching all stored inventories on each new advisory needs a reverse index.", "Emit low-confidence matches vs hide them: showing them improves recall, but trains users to dismiss the report."],
    p: ["Matching without recording which advisory version produced a result makes a changed verdict impossible to explain.", "Rerunning old scans after a rule change silently rewrites historical results and reports."],
    v: "Publish a new advisory and confirm that stored inventories containing the affected version produce a new finding without a rescan of the source, and that each finding shows the matched range and advisory revision.",
    dep: ["advisory-index", "package-identity-matching", "range-evaluation", "dependency-graph"]
  },
  "fixed-version-resolution": {
    s: "Determines, for each finding, which versions contain the fix, including multiple maintained branches, so recommendations name an upgrade that actually exists.",
    d: "From the advisory's fixed events and the registry's list of releases, the resolver finds the lowest fixed version on the project's current release line and on later lines, excluding withdrawn or yanked releases. It reports whether a fix exists, whether it is a patch, minor or major step and whether any fix is installable under the project's constraints. It feeds upgrade plans, deadlines and gate rules like block only if fixable. Hard because advisory data and registries disagree, and fixed releases may be missing, yanked or themselves affected by another flaw.",
    k: ["Lowest fixed on the current branch vs the latest release: the lowest minimizes change, while the latest gets all fixes but risks breakage.", "Trust advisory fixed versions vs verify against the registry: the advisory is authoritative about the flaw, but only the registry shows what can be installed."],
    p: ["Recommending a fixed version that was withdrawn or never published to the project's registry mirror.", "Reporting no fix available because only the newest branch was examined, when an older branch has a patch release."],
    v: "For an advisory with fixes on two release lines, confirm that projects on each line are told the correct lowest fixed version for their line, and that a yanked fixed release is skipped.",
    dep: ["range-evaluation", "registry-client", "advisory-index"]
  },
  "distro-backport-matching": {
    s: "Handles operating-system packages where maintainers patch an old upstream version without changing its number, so the version alone cannot say whether a flaw is fixed.",
    d: "Distributions publish their own security data keyed to their package versions and release channels, stating the build in which each flaw was fixed. The matcher uses that data, not upstream ranges, for packages from system databases, comparing with the distribution's own version scheme and release identifier. Using upstream advisories on such packages creates a large share of false alerts. Hard because each distribution has different data, scheme and support lifecycle, and end-of-life releases have no data at all.",
    k: ["Prefer distribution data over upstream data: far fewer false alerts, but a flaw the distribution has not assessed is silently missed.", "Report unfixed-by-vendor findings vs hide them: reporting is complete, but the user cannot act and the list grows."],
    p: ["Applying upstream version ranges to a patched system package reports flaws that were fixed months ago.", "Scanning an end-of-life release returns nothing because no data exists, which looks like a clean result."],
    v: "Scan an image whose system package has a backported fix under an unchanged upstream number and confirm no finding is raised, while an earlier build of the same package is reported.",
    dep: ["epoch-and-revision", "os-package-db-readers", "advisory-normalization"]
  },
  "alias-resolution": {
    s: "Links the different identifiers under which one vulnerability is published by different sources, so findings can be merged and facts attached to the right flaw.",
    d: "A single flaw may have an identifier from the central numbering scheme, one from a language ecosystem database, one from a distribution and one from a vendor. Sources list their cross-references as aliases; the resolver builds equivalence classes from them with a graph and picks a canonical identifier. Scores, exploit data and exceptions then attach to the class. Hard because alias claims can be wrong or asymmetrical, and merging classes by mistake attaches one flaw's data and waiver to a different flaw.",
    k: ["Transitive alias closure vs direct links only: closure finds more equivalences, but one bad link can merge two unrelated flaws.", "Stable canonical ID vs prefer the most specific source: stability helps history, while specificity gives better detail."],
    p: ["A single incorrect cross-reference merges two flaws, so a waiver for one silences the other.", "Alias changes after ingestion alter the canonical identifier and break references held by tickets."],
    v: "Ingest three advisories for the same flaw with partial cross-references and confirm they form one class with one canonical identifier, and that an advisory with a wrong link is flagged rather than silently merged.",
    dep: ["advisory-normalization", "advisory-deduplication"]
  },
});
