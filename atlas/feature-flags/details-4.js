// Details for the feature flag service plate, part 4: evaluation, segments, rollouts.
ATLAS.details("feature-flags", {
  "flag-and-variant-model": {
    s: "The data model for a flag: a stable key, a value type, a set of named variants with values, and the per-environment configuration that chooses among them.",
    d: "A flag has a key, a type, variants (each a value such as true, false, a string or a structured document), an on or off state, an off variant and a targeting configuration per environment. Boolean flags are the common case; multivariate flags carry several values, used for experiments and configuration. Version numbers increase with each change. The model is simple but everything else depends on it, so changes need compatibility with every SDK. It is hard because variants are part of the contract between service and code.",
    k: ["Typed variants versus untyped values: type errors are caught at definition time, but richer types complicate every SDK.", "Naming variants versus relying on position: stable references when variants are reordered, but one more field to keep consistent."],
    p: ["Changing a variant's value changes behavior for every rule that serves it, though no rule was edited.", "Using a string flag for configuration lets any typo become a valid value that code does not handle."],
    v: "Create a three-variant string flag, serve each variant to a test context through rules, and confirm each SDK returns the exact string and variant name with the current version number.",
    dep: ["ruleset-serialization"]
  },
  "evaluation-context": {
    s: "The set of attributes describing the entity being evaluated, such as user, device or account, supplied by the application at each check and used by targeting and bucketing.",
    d: "A context has a kind, a key that uniquely identifies the entity and bucketing, and attributes with typed values such as country, plan or app version. The application builds it from its own knowledge at the call site. The SDK passes it to the evaluator, and the contents determine which rules match. Multiple contexts can be combined. It is hard because attribute naming is not enforced across services, because types differ (the string '5' is not the number 5), and because the key must be stable for rollouts to be stable.",
    k: ["Application-supplied attributes versus service-side lookup: no extra dependency and local evaluation, but each caller must build the context correctly.", "A schema for attributes versus free-form: typos and type drift are caught, but onboarding new attributes needs a change first."],
    p: ["Two services pass country as 'US' and 'us' and the rule matches only one of them.", "A key built from a request id gives every request a new bucket, so a user sees different variants on each page."],
    v: "Evaluate one flag with contexts that differ only in one attribute and confirm the variant changes as the rule states. Evaluate twice with the same key and confirm the same variant both times.",
    dep: ["flag-and-variant-model"]
  },
  "rule-evaluator": {
    s: "The function that walks a flag's prerequisites, targets and rules in order and returns the first matching outcome for a context.",
    d: "Evaluation checks if the flag is off, then prerequisites, then individual targets, then rules in order, then the fallthrough. Each rule tests its clauses against context attributes, including segment membership, and yields a variant or a rollout that is resolved by bucketing. The result carries the variant, value and reason. It touches no network or clock and must be deterministic. It is hard because every SDK language reimplements it, and any divergence means two services give the same user different answers.",
    k: ["Reimplementing the evaluator in every SDK versus one shared core compiled for each runtime: native idioms and no foreign code, but divergence must be caught by tests.", "Order-dependent rules versus a priority number: simple to read, but inserting a rule requires thinking about everything below it."],
    p: ["A clause on a missing attribute is treated as a match in one SDK and as a non-match in another.", "An unhandled error in one rule makes the whole evaluation return the default and hides the cause."],
    v: "Run the same fixture of one thousand flag and context pairs through every SDK and confirm all return identical variants and reasons, including cases with missing attributes and type mismatches.",
    dep: ["flag-and-variant-model", "evaluation-context", "targeting-operators", "segment-definitions", "consistent-hash-bucketing", "fallthrough-and-off-variants"]
  },
  "targeting-operators": {
    s: "The set of comparisons a rule clause can use: equality, membership, string matching, numeric and date ordering and semantic version comparison.",
    d: "Operators include in, starts with, ends with, contains, matches a pattern, less than, greater than, before, after and semantic version comparisons, each with negation. Each defines how it treats types, missing attributes, arrays of values and case. Pattern matching uses a restricted dialect to prevent catastrophic backtracking. It is hard because operator semantics must be identical in every SDK, including edge cases such as comparing a number to a string, and a rule engine becomes a language that cannot easily be changed.",
    k: ["A small fixed operator set versus an expression language: easy to implement identically and review, but occasional needs are awkward.", "Strict typing versus coercion: predictable results, but a number sent as a string stops matching a numeric rule."],
    p: ["A regular expression with nested repetition takes seconds to evaluate on one input and stalls the request thread.", "Version comparison on a string like 1.10 as a number treats it as less than 1.9."],
    v: "Evaluate each operator against a table of inputs including empty, missing, wrongly typed and Unicode values and confirm every SDK returns the documented result for every row.",
    dep: ["evaluation-context"]
  },
  "fallthrough-and-off-variants": {
    s: "The two defaults inside a flag: what to serve when targeting is off, and what to serve when it is on but no rule matches.",
    d: "Every flag has an off variant served to everyone when the flag is switched off, and a fallthrough served when no rule or target matched, which may be a single variant or a percentage rollout. These are separate from the in-code default that an SDK uses when it has no data at all. Keeping them distinct is what makes a kill switch work. It is hard because people conflate off with false and default with off, and flags with inverted meaning create confusion.",
    k: ["A separate off variant versus off meaning the first variant: any variant can be the safe one, but one more setting per flag.", "Fallthrough as a rollout versus a single variant: lets the main population ramp up gradually, but hides the rollout inside the default."],
    p: ["Off serves false for a flag whose code treats true as safe, inverting the shutoff.", "Users who match no rule fall into a percentage rollout when the author expected the off value."],
    v: "Turn a flag off and confirm every context gets the off variant with reason off. Turn it on with no matching rule and confirm the fallthrough variant is served with that reason.",
    dep: ["flag-and-variant-model", "percentage-rollout"]
  },
  "evaluation-reasons": {
    s: "Metadata returned with each evaluation saying why that value was chosen: off, a target, which rule, fallthrough, prerequisite failed or an error.",
    d: "Along with the value, the evaluator returns a reason structure: kind, rule index or id, prerequisite key, error type and whether the result is part of an experiment. Reasons let people answer why a user got a variant, feed exposure logging and make error fallbacks visible. They add payload size and slightly more work, so SDKs only attach them on request, except for flags in experiments. It is hard because reasons expose rule structure, which client-side SDKs should not reveal in full.",
    k: ["Returning reasons always versus on demand: simpler debugging, but extra bytes and processing on every evaluation.", "Detailed rule identifiers versus coarse kinds: precise debugging, but they leak targeting structure to client-side users."],
    p: ["Reasons are not recorded in logs, so after an incident nobody can say why a user saw a variant.", "Reasons sent to browsers reveal internal segment names and rule descriptions."],
    v: "Evaluate a flag for a context that hits the third rule and confirm the reason names that rule. Evaluate with a missing flag key and confirm the reason is an error of kind flag not found.",
    dep: ["rule-evaluator"]
  },
  "ruleset-serialization": {
    s: "The versioned wire format for flags and segments, shared by the service, SDKs, caches and files, with compatibility rules for adding fields over time.",
    d: "Rulesets are serialized as JSON documents or a compact binary equivalent, listing each flag with its version, variants, rules and rollout details, and each segment. Unknown fields must be ignored by old SDKs, and unknown operators must fail safely rather than guess. A schema version lets the service send only the fields a client supports. It is hard because SDKs in old application versions live for years, so every format change must work with old readers and the service must support multiple formats at once.",
    k: ["Forward-compatible additive changes versus versioned breaking changes: old clients keep working, but the format accumulates optional fields.", "Verbose JSON versus compact binary: easy to inspect and debug, but bigger and slower to parse on constrained devices."],
    p: ["A new rule type sent to an old SDK is ignored, so rules silently match everyone or nobody.", "Large rulesets take too long to parse on a low-end device and delay startup."],
    v: "Send a ruleset containing an unknown future field and operator to the oldest supported SDK and confirm the known flags evaluate correctly and the unsupported rule fails safe with a logged warning.",
    dep: []
  },
  "cross-sdk-conformance-suite": {
    s: "A shared set of test cases, run against every SDK in every language, proving they return identical variants, reasons and bucket values for the same inputs.",
    d: "The suite is a data file of flag definitions, contexts and expected results, covering operators, rule order, prerequisites, bucketing, missing attributes, Unicode keys and error cases. Each SDK has a thin harness that loads the file and checks every row. New behavior is added to the data first. It is hard because the cases that expose divergence are rare edge cases, and because floating point and string handling differ between runtimes, so even hash-to-percentage conversion must be tested with exact values.",
    k: ["Shared data fixtures versus per-SDK tests: one definition of correct behavior, but every SDK needs a harness and a new case blocks all releases until each passes.", "Testing bucket values exactly versus statistically: catches single-bit differences, but fixes the hashing algorithm forever."],
    p: ["A new SDK language ships after passing its own tests that never covered the shared edge cases.", "Fixtures cover only successful matches, so error and missing-data behavior diverges."],
    v: "Run the suite against every SDK build in continuous integration and confirm zero differing rows. Then deliberately change one operator in one SDK and confirm the suite fails on named rows.",
    dep: ["rule-evaluator", "consistent-hash-bucketing", "targeting-operators"]
  },
  "segment-definitions": {
    s: "Named, reusable groups of users that can be referenced by many flags, defined by explicit member lists, rules or both.",
    d: "A segment holds included and excluded keys and optionally rules over attributes. A flag rule asks whether the context is in the segment. Segments are shared across flags and environments of a project, so a change to one affects every flag that uses it. They are delivered to SDKs with the rest of the ruleset. It is hard because one edit has a broad blast radius, segment references must be validated, and the same segment can be large enough to strain delivery.",
    k: ["Shared reusable segments versus rules copied into each flag: change once and update everywhere, but a change is hard to scope and review.", "Segments scoped to one environment versus shared: production lists stay separate from test data, but promotion needs care."],
    p: ["Editing a segment used by fifty flags changes all of them and the audit shows only one edit.", "Deleting a segment still referenced by a flag makes the rule match nobody."],
    v: "Add a user to a segment used by three flags and confirm all three evaluate differently for that user within the propagation target, and that an audit entry lists the segment change.",
    dep: ["flag-and-variant-model", "environment-model"]
  },
  "rule-based-segments": {
    s: "Segments defined by conditions on attributes rather than lists of keys, so membership updates automatically as user attributes change.",
    d: "A rule-based segment is a set of clauses, such as plan equals enterprise and country in a list. Membership is computed at evaluation time from the context, with no stored list, so it is always current and costs nothing to store. It runs the same operator logic as flag rules, and can combine with explicit inclusions and exclusions. It is hard because its result depends entirely on what the application puts in the context, and because segments referencing other segments need cycle protection.",
    k: ["Computed membership versus stored lists: always current and compact, but cannot express groups defined by past behavior that the context does not carry.", "Allowing nested segment references versus flat: reusable building blocks, but cycles and depth limits must be enforced."],
    p: ["An attribute used by the segment is not sent by one client, so its users are quietly excluded.", "Two segments referring to each other create a loop that recurses until a stack limit."],
    v: "Define a segment on country and plan, then evaluate contexts that differ in each attribute and confirm membership follows the conditions, including that a user changing plan joins or leaves immediately.",
    dep: ["segment-definitions", "targeting-operators", "evaluation-context"]
  },
  "large-list-segments": {
    s: "Segments with millions of explicit members, stored outside the ruleset and queried by key, because shipping every member to every SDK is impractical.",
    d: "A list segment of a million keys is too big to download to every client. Instead, the service stores membership in a separate store, and SDKs check it through a query path, a cached approximate structure such as a Bloom filter, or a database integration owned by the customer. Updates arrive through a separate sync. It is hard because it introduces a network or storage dependency into evaluation, which otherwise has none, plus a second consistency problem between the segment and the rules.",
    k: ["Querying membership remotely versus shipping the list: small SDK memory, but evaluation can now fail or add latency.", "Approximate membership filters versus exact lookups: small and fast, but false positives place the wrong users in the segment."],
    p: ["The membership store is slow or down, and every flag using the segment returns defaults.", "A filter's false positives admit users to a restricted beta that they should not see."],
    v: "Load a list of one million keys, evaluate a member and a non-member through the SDK, and confirm correct answers with measured evaluation latency and memory within the stated limits.",
    dep: ["segment-definitions", "flag-store", "delta-and-conditional-updates"]
  },
  "context-kinds-and-multi-context": {
    s: "Lets one evaluation involve several kinds of entity at once, such as a user, an organization and a device, with rules and rollouts targeting any of them.",
    d: "A multi-context holds one context per kind, each with its own key and attributes. A rule names the kind it tests, so it can match organization attributes while a rollout buckets by organization key. This lets a feature roll out to whole accounts consistently regardless of which user is acting. It is hard because every rule, segment and rollout must say which kind it refers to, and because experiments need a choice of the unit analyzed.",
    k: ["Bucketing by organization versus by user: all members of an account see the same experience, but fewer independent units reduce statistical power.", "Typed context kinds versus one flat user object: rules are explicit about their subject, but migrating existing flags needs mapping."],
    p: ["Rolling out by user inside one account gives colleagues different experiences and causes support confusion.", "Rules keyed on a kind the application omitted from the context silently never match."],
    v: "Evaluate a flag bucketed by organization for ten users in one organization and confirm all ten receive the same variant, while users in other organizations are distributed according to the percentage.",
    dep: ["evaluation-context", "consistent-hash-bucketing", "segment-definitions"]
  },
  "anonymous-to-known-identity": {
    s: "Keeps a visitor's assigned variants stable when they sign in and an anonymous identifier is replaced by an account identifier.",
    d: "Anonymous visitors are bucketed by a generated device or cookie identifier. After login the key becomes an account identifier, which hashes to a different bucket, and the user may see a different variant mid-session. Solutions include bucketing by the original anonymous key until the experiment ends, aliasing the two identifiers in analysis, or running logged-in-only experiments. It is hard because the identity merge crosses devices, privacy consent and the analytics system at the same time.",
    k: ["Keeping the anonymous key for bucketing versus switching to the account key: no variant flip at login, but one person on two devices can see different variants.", "Aliasing identities in analysis versus excluding mixed users: keeps more data, but wrongly merged identities pollute results."],
    p: ["A user signs in and their variant flips, so their first purchase is attributed to the wrong arm.", "The anonymous cookie is cleared, so the same person is counted as a new user and exposed repeatedly."],
    v: "Evaluate an experiment flag as an anonymous visitor, then sign in, and confirm the variant remains identical and that analysis joins both identifiers to a single user.",
    dep: ["evaluation-context", "consistent-hash-bucketing", "assignment-logging"]
  },
  "attribute-privacy": {
    s: "Controls which context attributes leave the application: private attributes are used for local evaluation but removed before being sent in events.",
    d: "Targeting often needs sensitive attributes such as email or location. SDKs can mark named attributes as private, or all attributes, so they are used locally but replaced by the attribute name only in outgoing events. Keys can be hashed before transmission. For client-side evaluation, anything sent to the service for evaluation is by definition shared. It is hard because privacy decisions are made by people who write context code, not by the platform, and because analytics sometimes need exactly the attributes privacy removes.",
    k: ["All attributes private by default versus opt-in: personal data does not leak through events, but debugging and analytics get less to work with.", "Hashing keys before transmission versus plain keys: protects identity, but support staff cannot look up a user by key."],
    p: ["An attribute is added to the context without being marked private and starts appearing in stored events.", "Hashed keys differ between the application and the support tool, so a user cannot be found."],
    v: "Evaluate with a private email attribute, capture the outgoing event payload and confirm the attribute value is absent and only its name is listed, while targeting on the email still matched locally.",
    dep: ["evaluation-context", "event-batching-and-sampling"]
  },
  "consistent-hash-bucketing": {
    s: "Maps a user key and flag to a stable number between zero and one hundred using a hash, so the same user always lands in the same place without stored state.",
    d: "The evaluator hashes a string made from the flag's salt and the context key, takes a fixed number of bits and scales the result to a fraction between zero and one. A rollout of N percent includes keys whose fraction is below N. Because the hash is deterministic and uniform, raising N only adds users, never removes any. All SDKs must use the same hash and arithmetic. It is hard because tiny differences, such as integer width or string encoding, change which users are included.",
    k: ["A deterministic hash versus a stored assignment table: no storage and identical answers everywhere, but you cannot move a particular user.", "Hash including the flag salt versus key alone: different flags place the same user independently, but a stable assignment is lost when the salt changes."],
    p: ["Two SDKs convert hash bits to a fraction differently and disagree on borderline users.", "Using the same bucketing for all flags means the same ten percent of users get every new feature."],
    v: "Hash one million random keys and confirm the distribution is uniform within statistical tolerance, then confirm every SDK returns identical bucket values for a fixed list of known keys.",
    dep: ["bucketing-salt-and-seed", "evaluation-context"]
  },
  "bucketing-salt-and-seed": {
    s: "The per-flag random string mixed into the hash that determines which users fall into which buckets, and that can be changed to reshuffle everyone.",
    d: "Each flag has a salt, usually generated at creation, so its buckets are independent of other flags. Reusing a salt deliberately puts two flags in the same assignment, such as for a related change that must show to the same users. Resetting a salt reassigns all users, which is occasionally wanted when restarting an experiment after contamination. Experiments may also use their own seed. It is hard because a salt change is invisible, instantly affects every user in the rollout, and cannot be undone except by restoring the old value.",
    k: ["A unique salt per flag versus a global salt: rollouts are statistically independent, but related flags no longer share a user population.", "Resettable salt versus fixed: a contaminated experiment can restart cleanly, but a mistaken reset flips a large share of users."],
    p: ["A salt is regenerated while copying a flag between environments and production users are reshuffled.", "Two experiments accidentally share a salt and are fully correlated, so their effects cannot be separated."],
    v: "Change a flag's salt in a test environment and confirm roughly half of users in a fifty percent rollout change variant. Restore it and confirm all users return to their earlier variants.",
    dep: ["consistent-hash-bucketing", "flag-and-variant-model"]
  },
  "percentage-rollout": {
    s: "Serves a variant to a configured share of users, chosen by hash bucket, so a feature can be exposed gradually to more people over time.",
    d: "A rollout assigns bucket ranges to variants, for example ninety-five percent control and five percent new. Because buckets are stable, increasing the percentage to twenty keeps the original five percent and adds fifteen more. Rollouts can be attached to a rule, so only a segment is ramped, or to the fallthrough. They can have an exclude-from-rollout list. It is hard because weights are integers with finite resolution, the sum must be exactly one hundred percent, and a rollout hides who is in it.",
    k: ["Stateless bucketing versus recording each admitted user: nothing to store and instant, but a user can drop out if the key or salt changes.", "Weights in whole percent versus finer resolution: simple to read, but a tiny rollout of a huge population cannot be expressed precisely."],
    p: ["A rollout of one percent on a very large user base exposes hundreds of thousands of people, which can still be a serious incident.", "Rollout weights that do not sum to the full range send some users to no variant."],
    v: "Set a rollout to ten percent over one hundred thousand distinct keys and confirm about ten thousand receive the variant. Raise to twenty and confirm all earlier ten percent still receive it.",
    dep: ["consistent-hash-bucketing", "multivariate-allocation", "flag-and-variant-model"]
  },
  "multivariate-allocation": {
    s: "Divides traffic among more than two variants by weight, assigning each bucket range to one variant, as in an experiment with a control and several treatments.",
    d: "Weights are cumulative ranges over the bucket space, ordered by variant. Changing the weight of one variant moves the boundaries of the ones after it, which can reassign users who were not meant to change. Good implementations compute ranges so that increasing a treatment takes from control without disturbing others, or restart the experiment when reallocating. It is hard because allocation changes mid-experiment bias results, and because weights across many variants need to total exactly the full range.",
    k: ["Cumulative ranges in a fixed order versus independent per-variant hashing: simple and exact total, but weight changes shift neighbor boundaries.", "Allowing reallocation of a running experiment versus locking: operational flexibility, but changes assignment mid-run and complicates analysis."],
    p: ["Changing the third variant's weight reassigns users between the first and second variants.", "Rounding weights produces a total of ninety-nine point nine percent and a sliver of users with no variant."],
    v: "Allocate four variants at equal weights, count assignments for one million keys and confirm each is near twenty-five percent. Raise one weight and confirm only the intended users move.",
    dep: ["consistent-hash-bucketing", "flag-and-variant-model"]
  },
  "sticky-assignment": {
    s: "Guarantees a user keeps the variant they were first given even after rules or percentages change, by storing the assignment rather than recomputing it.",
    d: "Hash bucketing is stable only while the rules, salt and percentages are unchanged. When an experiment must not change a user's experience, such as a pricing test, the assignment is stored in a table or cookie on first evaluation and returned afterward. This needs a store keyed by user and flag with a fast read path. It is hard because it brings state into an otherwise stateless evaluation, introduces a place for the store to fail, and needs policies for cleaning up old assignments.",
    k: ["Stored assignments versus recomputing from the hash: users never flip even if configuration changes, but evaluation needs a fast shared store.", "Cookie or device storage versus a server table: no server state, but lost cookies and multiple devices split a person into several."],
    p: ["The assignment store is unavailable, so evaluation falls back to the hash and users flip variants mid-experiment.", "Old assignments are never expired and constrain a later experiment that reuses the flag."],
    v: "Assign a user, change the rollout to exclude them, evaluate again and confirm the stored variant is returned. Clear the stored record and confirm the evaluation returns to the current rules.",
    dep: ["consistent-hash-bucketing", "percentage-rollout", "assignment-logging"]
  },
  "gradual-rollout-schedules": {
    s: "Predefined plans that increase a rollout in timed or conditional steps, such as one, five, twenty-five and one hundred percent over a week.",
    d: "A schedule is a list of steps with percentage and either a time or a condition, such as health metrics staying within bounds. A scheduler applies steps through the normal publish path so each is an audited version. Plans can include pauses for review at stages that matter, like regions or customer tiers. It is hard because each step's wait needs enough traffic to detect problems, and because plans must adapt when someone changes the flag by hand.",
    k: ["Time-based steps versus condition-based steps: predictable launch calendar, but a bad step still advances unless something stops it.", "Plan applied as a whole versus step by step approval: fast and hands-off, but the riskiest steps get no extra review."],
    p: ["The plan advances overnight while no one is watching and a problem appears at peak traffic the next morning.", "A manual change to the flag is overwritten by the next scheduled step."],
    v: "Create a three-step plan, let it run in a test environment and confirm each step produced a separate version at the planned time. Edit the flag by hand mid-plan and confirm the plan pauses.",
    dep: ["percentage-rollout", "scheduled-changes", "automated-rollback"]
  },
  "automated-rollback": {
    s: "Reverts a flag to its previous safe state automatically when a monitored metric crosses a threshold, without waiting for a person to notice.",
    d: "A monitor compares a health metric for the new variant against control or a fixed limit, such as error rate or latency. When it breaches for a configured duration, the system calls the flag API to set the rollout to zero or restore the previous version, records the reason in the audit log and notifies the owner. It is hard because metric delay hides problems, a noisy metric causes false rollbacks, and rollback itself must not make things worse by flipping the behavior of users mid-action.",
    k: ["Automatic rollback versus alert-only: limits damage when nobody is watching, but false positives remove good changes.", "Rolling back to zero versus to the prior percentage: stops all exposure, but discards the progress of a long ramp."],
    p: ["A metric from a delayed pipeline triggers rollback long after the harm began.", "A rollback fires repeatedly on a flapping metric and leaves the flag oscillating."],
    v: "Make a test variant exceed its error threshold and confirm the flag returns to its prior state within the stated delay, an audit entry names the monitor, and the owner is notified once.",
    dep: ["guardrail-metrics", "change-history-and-rollback", "observability-annotations", "audit-log"]
  },
});
