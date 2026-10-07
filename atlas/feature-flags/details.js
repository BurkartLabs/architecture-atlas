// Details for the feature flag service plate, part 1: management console, lifecycle.
ATLAS.details("feature-flags", {
  "flag-list-and-search": {
    s: "The index of all flags in a project, filterable by name, tag, owner, status, environment state and last-changed date, so people can find the flag they need quickly.",
    d: "The list reads flag metadata from the control plane API and combines it with per-environment state and usage data such as last evaluation time. Search covers keys, names, descriptions and tags. Filters answer operational questions: which flags are on in production, which have no owner, which have not been evaluated in thirty days. It is hard because projects accumulate thousands of flags, so the list needs server-side paging and indexed queries, and the view must stay consistent with changes made elsewhere.",
    k: ["Server-side search versus loading every flag into the browser: scales to large projects, at the cost of a query API and slower interaction than local filtering.", "Showing live environment state in the list versus metadata only: more useful during incidents, but each row now needs data from several stores."],
    p: ["A list that lags behind recent edits makes people edit a flag they believe is off.", "Flags with near-identical names get toggled by mistake because the list shows no ownership or purpose."],
    v: "Create a flag, tag it, and confirm it appears in a filtered search within seconds. Toggle it in another session and confirm the list row shows the new state after refresh.",
    dep: ["flag-store", "flag-ownership-metadata", "last-evaluated-tracking"]
  },
  "flag-editor": {
    s: "The form for creating a flag and editing its key, variants, default behavior, description, tags and per-environment settings, with validation before anything is saved.",
    d: "Creating a flag sets an immutable key, a value type (boolean, string, number or structured), the list of variants and what each environment serves when the flag is off or no rule matches. Editing builds a proposed new configuration and submits it to the control plane, which validates it and rejects stale edits using the version the editor started from. The hard part is concurrency and safety: two people editing the same flag must not silently overwrite each other, and a typo in a key must not create a second flag.",
    k: ["Immutable flag keys versus renamable keys: code references stay valid forever, but a poorly chosen key must be lived with or replaced by a new flag.", "Optimistic version checks versus edit locks: concurrent editors never block each other, but the loser of a conflict must redo the change."],
    p: ["A key typo in the console creates a new flag that defaults off, and the intended flag is never changed.", "An editor open for an hour submits an old copy and reverts a colleague's change if versions are not checked."],
    v: "Open the same flag in two sessions, save a change in the first, then save in the second. Confirm the second save is rejected with a conflict and the first change is intact.",
    dep: ["validation-and-compilation", "config-versioning", "flag-and-variant-model"]
  },
  "targeting-rule-editor": {
    s: "The interface for building ordered rules that match users by attributes and segments and serve a chosen variant or rollout, shown in a form people can read back.",
    d: "Rules are ordered; the first matching rule decides the result. Each rule has clauses (attribute, operator, values) combined with AND, optional segment membership, and an outcome that is either one variant or a percentage split. The editor helps by suggesting known attributes, validating value types, and showing a plain-language summary. It must also let an author test a rule against a sample context before saving. The difficulty is making rule order and precedence obvious, since a reordered rule changes behavior without changing any single rule.",
    k: ["First-match-wins ordering versus scored or weighted rules: predictable and easy to explain, but authors must manage order deliberately as rules accumulate.", "A structured form versus free-form expression text: forms prevent syntax errors and aid review, while expressions are denser and more powerful for engineers."],
    p: ["Dragging a broad rule above a narrow one changes who is targeted, and the diff shows only a position change.", "Targeting on an attribute the application never sends matches nobody, and the editor gives no warning."],
    v: "Enter a sample context in the test panel and confirm it reports which rule matched and which variant is served, then save and confirm a real SDK call with that context returns the same variant.",
    dep: ["rule-evaluator", "targeting-operators", "segment-definitions", "evaluation-context"]
  },
  "change-preview-and-diff": {
    s: "Shows exactly what a pending change will alter, as a structured before-and-after comparison, and often an estimate of how many users will see different results.",
    d: "Before a save, the console computes a diff between the current published configuration and the proposed one, at the level of rules, variants, ordering and rollout weights rather than raw JSON text. A preview may also replay recent contexts or sample traffic through both versions to estimate the share of users whose variant changes. The difficulty is that structural diffs of ordered lists are confusing, and an impact estimate requires representative context samples that privacy rules may prevent the service from keeping.",
    k: ["Semantic diff versus raw text diff: readers see rule-level intent, but the diff code must understand every configuration construct.", "Impact estimation from stored sample contexts versus no estimate: warns about large blast radius, but requires retaining user attributes."],
    p: ["A text diff showing only moved lines hides that a rule reorder flips the served variant for half of all users.", "An impact estimate based on an outdated sample reports low risk for a change that affects a recently grown segment."],
    v: "Change the percentage on a rollout rule from ten to thirty and confirm the diff shows only that weight change and the estimate shows roughly twenty percent more users receiving the new variant.",
    dep: ["config-versioning", "ruleset-serialization", "rule-evaluator"]
  },
  "scheduled-changes": {
    s: "Lets a change be queued to apply at a future time, such as enabling a feature at a launch hour, so nobody has to be at a keyboard at that moment.",
    d: "A scheduled change stores the proposed edit with a target time and creator. At that time a scheduler applies it through the same validation and permission path as a manual edit, producing a normal versioned change with the audit entry attributed to the schedule. Conflicts are the central problem: if the flag changed between scheduling and execution, the stored edit may no longer apply cleanly, so the system must rebase, reject or alert. Time zones and daylight saving make the human intent ambiguous.",
    k: ["Stored edits applied at the time versus stored target states: edits compose with intervening changes, but target states are simpler to understand and may overwrite later work.", "Executing through the normal publish path versus a special path: approvals and validation still apply, but a rule requiring human approval can block a launch."],
    p: ["A schedule created weeks earlier fires after the flag was reworked and applies an obsolete rule set.", "The scheduler is down at the target minute and the launch is silently late, with no alert."],
    v: "Schedule a flag to turn on two minutes ahead, wait, and confirm a new version exists with the schedule recorded as author and an SDK in staging returns the new value.",
    dep: ["config-versioning", "roles-and-permissions", "config-publisher", "audit-log"]
  },
  "kill-switch-controls": {
    s: "A deliberately minimal path to turn a feature off immediately, with confirmation, special permissions and speed taking priority over every other consideration in the interface.",
    d: "A kill switch is a flag type whose normal state is on and whose off state is the emergency state. The interface offers it prominently, often on a mobile-friendly page, and bypasses nonessential steps such as approval requests, while still recording who acted. Behind it the change takes the fastest delivery path, triggering streaming notification and cache invalidation immediately. It is hard because it must work during an outage of other systems, and the feature it disables must have been designed to degrade safely.",
    k: ["Bypassing approvals for emergency shutoff versus requiring them for every change: minutes saved during an incident, but a rule is needed to prevent abuse of the shortcut.", "A dedicated fast path versus the general publish path: lower latency and fewer dependencies, but one more code path to keep correct."],
    p: ["The switch is flipped but a long polling interval leaves clients on the old state for minutes.", "The disabled code path was never exercised, so turning the feature off causes a different failure."],
    v: "Flip a kill switch in a test environment with clients connected and confirm every connected client returns the off value within the stated propagation target, then flip back.",
    dep: ["roles-and-permissions", "config-publisher", "change-notification-fanout", "audit-log"]
  },
  "environment-comparison": {
    s: "Shows a flag's configuration side by side across environments, such as development, staging and production, to expose drift and make promotion between them explicit.",
    d: "Environments hold independent copies of each flag's rules, so a flag can be fully on in staging and off in production. The comparison view lines these up and highlights differences in targeting, variants and rollout state. Some systems offer a copy or promote action that applies one environment's rule set to another, minus environment-specific values such as individual user lists. The hard part is deciding what counts as drift worth flagging and what is intentional, and making promotion safe for rules that refer to environment-specific segments.",
    k: ["Independent per-environment configuration versus one definition with environment overrides: independence is simple and safe, but promoting a change means repeating it.", "Copying rules between environments versus rebuilding them: faster and less error-prone, but references to segments or keys that do not exist in the target must be handled."],
    p: ["A flag promoted to production without its staging segment resolves the segment as empty and targets nobody.", "People assume staging matches production, test there, and miss a rule that exists only in production."],
    v: "Change a rule in staging, open the comparison, and confirm the difference is shown. Promote the rule to production and confirm the comparison reports no difference and a version was recorded.",
    dep: ["environment-model", "config-versioning", "segment-definitions"]
  },
  "flag-types-and-intent": {
    s: "A classification of each flag by purpose, such as release, experiment, operational or permission, which determines how long it should live and how it is managed.",
    d: "Release flags hide unfinished work and should be removed within weeks. Experiment flags split traffic and end when a decision is made. Operational flags, including kill switches, may live for years. Permission or entitlement flags gate paid features and are effectively permanent. Recording the type at creation lets the system set expiry defaults, choose cleanup rules and warn when a short-lived flag is treated as permanent. It is hard because intent drifts: a release flag that nobody removes quietly becomes load-bearing configuration.",
    k: ["Fixed flag types with built-in lifecycle versus free tags: types drive automatic policy, but real flags often fit more than one purpose.", "Requiring a type at creation versus allowing it to be set later: complete metadata from the start, at the cost of a slower creation form that people resent."],
    p: ["A temporary release flag is reused as a permanent entitlement check and its cleanup is never scheduled.", "Everything is created as the default type, so type-based expiry policies never fire."],
    v: "Create flags of each type and confirm the console assigns different default expiry dates and that the stale-flag report applies the release rule to the release flag but not the permanent one.",
    dep: ["flag-and-variant-model", "flag-ownership-metadata"]
  },
  "flag-ownership-metadata": {
    s: "Records who is responsible for each flag, along with a description, purpose, linked work item and team, so questions about a flag have someone to go to.",
    d: "Ownership is an individual or team stored with the flag, plus free text on why it exists and what removing it requires. The service uses it for notifications about expiry, for routing approval requests and for filtering lists. Ownership decays: people change teams and leave, so the metadata needs to resolve through the identity directory and flag orphaned flags. It is hard because maintaining it is overhead nobody sees the payoff from until the flag is stale and someone must decide whether it is safe to delete.",
    k: ["Owner as a team versus a person: survives individual departures, but diffuses responsibility so nobody feels asked.", "Required metadata at creation versus optional: complete records, at the risk of placeholder text that satisfies the form and says nothing."],
    p: ["The owner leaves the company and every notification about their flags goes to a deactivated account.", "Descriptions read 'test' or repeat the key, leaving future maintainers no way to judge whether it is safe to remove."],
    v: "Deactivate a user in the directory and confirm the console lists their flags as orphaned within the sync interval and routes the next expiry notice to the team fallback.",
    dep: ["flag-store", "sso-and-provisioning"]
  },
  "expiry-and-stale-detection": {
    s: "Identifies flags that should be removed because they passed an expiry date, have served one value for a long time, or have stopped being evaluated at all.",
    d: "Detection combines three signals: an expected-end date set at creation, evaluation telemetry showing whether any client still asks for the flag, and configuration state showing it has served only one variant to everyone for a long period. A flag at one hundred percent for months is a candidate for removal. A flag never evaluated is a candidate for deletion, but only after checking dormant code paths. It is hard because absence of evidence is weak: a quarterly batch job, or a rarely used page, may evaluate a flag only occasionally.",
    k: ["Usage-based staleness versus date-based expiry: usage reflects reality, while dates give owners a deadline even without telemetry.", "Automatic archival of unused flags versus notification only: less clutter, but a mistaken archive can break a rare code path."],
    p: ["A flag used only by a yearly process looks unused for eleven months and is archived just before it is needed.", "Staleness reports list hundreds of flags every week until people stop reading them."],
    v: "Stop evaluating a test flag in a staging client, wait past the staleness threshold, and confirm it appears in the stale report with its last-evaluated time and the owner receives one notification.",
    dep: ["last-evaluated-tracking", "flag-types-and-intent", "flag-ownership-metadata"]
  },
  "code-reference-scanning": {
    s: "Searches repositories for places where each flag key is referenced and shows them in the console, so removal can start from knowing exactly where the conditionals are.",
    d: "A scanner runs in continuous integration, or as a service against hosted repositories, matching flag keys in source files, including wrapper function calls and constants. It uploads a list of file, line and surrounding context per flag. The console then shows which repositories still use a flag and which do not. It is hard because keys are often built dynamically, aliased through constants or passed through wrapper functions, so a purely textual search both misses real references and finds false ones in comments.",
    k: ["Text matching with configurable aliases versus language-aware parsing: easy to set up everywhere, but misses indirection that parsing could follow.", "Scanning in the build pipeline versus a hosted crawler: fresh results tied to the commit, but each repository must be configured."],
    p: ["A key assembled from a prefix and a variable is never found, so the flag is declared unused and deleted.", "Scans of stale branches report references that exist nowhere in the main line, confusing cleanup."],
    v: "Add a reference to a flag in a branch, run the scanner, and confirm the console lists that file and line. Remove the reference, rescan, and confirm the flag shows zero references.",
    dep: ["flag-store", "flag-ownership-metadata"]
  },
  "cleanup-automation": {
    s: "Opens changes that remove a flag's conditional code, keeping the winning branch, so retiring a flag is a reviewed code change rather than manual editing.",
    d: "Once a flag is marked ready for removal with a chosen surviving variant, tooling uses code reference locations to rewrite call sites: replacing the check with the constant outcome and deleting dead branches. The result is submitted as a pull request for normal review and testing. The remaining flag record is archived only after that change is deployed. It is hard because correct removal needs program understanding, and wrapped, nested or combined flag conditions are rarely safe to transform mechanically.",
    k: ["Automated rewrite of call sites versus a checklist for humans: faster for simple conditionals, but a wrong transformation can ship plausible broken code.", "Archiving the flag when the cleanup change merges versus after deploy: tidier records, but early archival breaks clients still running the old build."],
    p: ["The rewrite removes the wrong branch because the variant meanings were inverted in one call site.", "The flag is archived while an old mobile app version still evaluates it, and that app falls back to its default."],
    v: "Mark a test flag ready with variant on, run cleanup, and confirm the opened change leaves only the on branch and that the build and tests pass before the flag is archived.",
    dep: ["code-reference-scanning", "flag-retirement-workflow", "issue-tracker-links"]
  },
  "prerequisite-flags": {
    s: "Lets one flag require that another flag serve a particular variant before it can be evaluated, so dependent features turn off when their foundation does.",
    d: "A prerequisite is a condition at the start of a flag: if the named flag does not evaluate to a given variant for the context, the dependent flag serves its off variant without checking its own rules. The evaluator resolves prerequisites recursively, with cycle detection at save time and a depth limit. The console shows the dependency graph. It is hard because it hides coupling: turning off a foundation flag silently disables everything downstream, and evaluation reasons have to report which prerequisite failed.",
    k: ["Explicit prerequisites versus requiring code to check multiple flags: dependencies are visible and enforced centrally, but graphs add evaluation work and a place for cycles.", "Strict failure when a prerequisite is missing versus ignoring it: safe by default, though a deleted prerequisite turns off a feature unexpectedly."],
    p: ["Deleting an old flag that still has dependents turns off several features at once.", "Deep chains make it hard to see why a user gets the off value without the reason showing the failed prerequisite."],
    v: "Make flag B require flag A on, turn A off, and confirm B evaluates to off with a reason naming the failed prerequisite. Turn A on and confirm B follows its own rules.",
    dep: ["rule-evaluator", "evaluation-reasons", "validation-and-compilation"]
  },
  "flag-retirement-workflow": {
    s: "The ordered sequence that takes a flag from decided, through code removal and deploy, to archived and finally deleted, with checks at each step.",
    d: "Retirement is a state machine: active, ready for removal with a chosen variant, code removed, archived, and deleted after a retention window. Moving between states runs checks: no references in scanned repositories, no evaluations for a set period, no dependents. Archived flags stay restorable and stop being delivered to clients. The hard part is coordination across teams and release trains: removal in the server code, the web client and several versions of mobile apps all have to finish before the flag stops being needed.",
    k: ["Soft archive with a retention window versus immediate delete: mistakes are recoverable, but archived flags still take space in lists and audit views.", "Blocking on zero references versus warning: prevents breaking live code, but an unreachable repository can hold up removal indefinitely."],
    p: ["A flag is deleted while a client from a legacy release still depends on it, and that client crashes on a missing key.", "The workflow stalls at 'ready for removal' because nobody is assigned the cleanup."],
    v: "Move a test flag through each state and confirm a client requesting it after archive receives the in-code default, and that restoring it returns the configured value on the next update.",
    dep: ["flag-store", "code-reference-scanning", "last-evaluated-tracking", "audit-log"]
  },
});
