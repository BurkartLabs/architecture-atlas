// Details part 2: policy, cost and testing; configuration language.
ATLAS.details("infrastructure-as-code", {
  "policy-as-code": {
    s: "Rules written in a declarative policy language and evaluated against the plan, the configuration and the state, blocking changes that violate organizational standards.",
    d: "After a plan is produced, its JSON form, plus configuration and prior state, is fed to a policy engine. Rules express conditions such as no public storage, required tags, allowed regions or maximum instance size. Each rule has an enforcement level: advisory, soft-mandatory with override, or hard-mandatory. Results attach to the run and gate approval. It is difficult because policies see only what the plan shows: unknown values at plan time cannot be checked, and rules must be tested like code since a wrong rule either blocks everything or protects nothing.",
    k: ["Evaluate the plan versus scan the configuration statically: plan evaluation sees computed values, while static scans run earlier and need no credentials.", "Hard-mandatory versus overridable rules: hard rules guarantee compliance, but a mistaken rule halts all work until fixed."],
    p: ["A rule that reads an attribute unknown until apply passes vacuously, so the violation is only caught after creation.", "Policies written without tests are loosened under pressure during an incident, and never tightened again."],
    v: "Write a rule forbidding public access, plan a configuration that sets it, confirm the run stops with the rule named, then fix the configuration and confirm the same rule reports pass.",
    dep: ["machine-readable-output","plan-diff","unknown-values"]
  },
  "plan-checks": {
    s: "Conditions written inside configuration, such as preconditions, postconditions and standalone checks, that validate assumptions about inputs and about real infrastructure.",
    d: "A precondition on a resource or output asserts something about its inputs before it is created or read; a postcondition asserts something about the result after. A standalone check block runs assertions against data sources on every plan and reports warnings without blocking. Each condition has an error message that is shown to the user. They are hard to use well because conditions that depend on unknown values cannot be evaluated until apply, and a failed postcondition after creation leaves a real object that state already tracks.",
    k: ["Blocking conditions versus warning-only checks: blocking conditions prevent bad changes, but warnings suit continuous health monitoring where failure should not stop other work.", "Conditions in configuration versus in external policy: in-config conditions travel with the module, while external policy applies uniformly without module authors' cooperation."],
    p: ["A postcondition that fails leaves the created object in state, so the next plan tries to modify it rather than recreate it.", "Checks that call slow external endpoints add latency to every plan."],
    v: "Add a precondition rejecting an empty name, plan with an empty value and confirm the run fails with the custom message and no provider create call is made.",
    dep: ["expression-evaluator","unknown-values","data-sources"]
  },
  "cost-estimation": {
    s: "A projection of monthly cost for the planned resources, computed from the plan and a price catalog, shown with the difference from the current deployment.",
    d: "The estimator reads the plan, maps each resource type and size attribute to a price lookup, and sums the difference between prior and planned. Usage-based items need assumptions supplied in configuration or defaults. The result shows before, after and delta, and can feed policy so that large increases need extra approval. It is approximate by nature: unknown values, usage-driven pricing, discounts and data transfer are invisible to the plan, so the number is a guard against order-of-magnitude mistakes rather than a bill.",
    k: ["Estimate from the plan versus from live billing data: plan estimates arrive before spending, but live data is accurate and only available afterward.", "Block on cost thresholds versus show only: thresholds stop runaway changes, but arbitrary limits train people to split changes into small steps."],
    p: ["A resource whose price depends on an unknown attribute is estimated as zero and understates the change.", "Teams read the estimate as a quote and are surprised by usage charges it could never include."],
    v: "Plan a change that doubles an instance size, confirm the estimate shows the delta in the right direction and matching a manual price lookup, and that resources with unknown size are listed as unestimated.",
    dep: ["machine-readable-output","plan-diff","unknown-values"]
  },
  "test-framework": {
    s: "A built-in way to write test files that run configuration against assertions, either by planning only or by applying real resources and destroying them afterward.",
    d: "A test file defines run blocks, each with variable overrides, a command mode of plan or apply, and assertions over outputs, resource attributes or expected failures. Runs execute in order and share state within a file, so later steps can build on earlier ones. After the file finishes, everything created is destroyed in reverse order. It is hard because tests of real infrastructure are slow, cost money and can leak resources when cleanup fails, so the framework must always attempt destruction and report what remains.",
    k: ["Plan-only tests versus apply tests: plan tests are fast and free but cannot see computed values; apply tests prove real behavior but cost time and money.", "Shared state across runs in a file versus isolated runs: sharing models multi-step scenarios, but one failed step leaves later ones meaningless."],
    p: ["A test that fails before cleanup leaves real resources running and billing until someone notices.", "Tests that hardcode names collide when two pipeline runs execute at once."],
    v: "Write a test with one failing assertion, run it, confirm the failure names the assertion and values, and confirm all created resources are destroyed afterward.",
    dep: ["plan-assertions","ephemeral-test-runs","mock-providers"]
  },
  "plan-assertions": {
    s: "Assertions evaluated against a plan, such as expected resource counts, attribute values and planned actions, that check intent without creating anything.",
    d: "In plan mode a test run produces a plan and evaluates expressions against the planned values, the same way configuration expressions do. Typical assertions confirm that a module creates three subnets, that a tag is present or that a change forces replacement. Failure messages include the expression and its value. The limitation is built in: any attribute assigned by the remote system is unknown at plan time, so assertions about it cannot be made without applying.",
    k: ["Assert on planned values versus on applied outcomes: planned assertions are cheap and early, but cover only what is known before creation.", "Expected-failure tests versus only happy paths: testing that validation rejects bad input documents the contract, but needs careful messages to avoid brittle matches."],
    p: ["Assertions on unknown values pass or error depending on mode, which hides the fact that nothing was checked.", "Asserting on exact counts of internal resources makes harmless refactors fail tests."],
    v: "Assert a module creates exactly three subnets given three inputs, then change the input to two and confirm the same test fails and reports the actual count.",
    dep: ["expression-evaluator","plan-diff","unknown-values"]
  },
  "ephemeral-test-runs": {
    s: "Test runs that create real resources in a throwaway scope, assert on the result and always destroy them, proving behavior that a plan cannot show.",
    d: "An apply-mode test provisions the configuration under test with generated unique names in a sandbox account or project, evaluates assertions against real outputs, then runs destroy in reverse order. A cleanup phase runs even after failures, and a run summary lists any objects the destroy could not remove. Credentials are limited to the sandbox and typically have budget limits. The challenge is leakage and flakiness: eventual consistency makes assertions race against propagation, and failed deletions of dependent objects can orphan billable resources.",
    k: ["Dedicated sandbox account versus shared development account: a sandbox contains blast radius and cost, but needs setup and separate credentials.", "Retry assertions versus fail fast: retries absorb propagation delay, but can mask real bugs that eventually look healthy."],
    p: ["A test killed by a pipeline timeout never reaches cleanup, so resources accumulate unseen.", "Fixed names make parallel runs fail with already-exists errors that look like configuration bugs."],
    v: "Run an apply-mode test, then list resources in the sandbox by the unique test prefix and confirm none remain, including after a run interrupted by a forced failure.",
    dep: ["test-framework","destroy-engine","credential-resolution"]
  },
  "mock-providers": {
    s: "Stand-in providers that return fabricated values for resources and data sources, so configuration logic can be tested quickly with no credentials or remote calls.",
    d: "A mock provider replaces the real plugin in a test file. It answers read and plan calls with values generated from the schema, or with values the test supplies for particular resources and data sources. Because no remote system is involved, tests run in milliseconds and need no credentials. The mock honors the provider's schema, so type errors are still caught. The limitation is fidelity: generated values are not realistic, and the mock cannot reproduce validation or behavior that the real service has.",
    k: ["Schema-generated defaults versus hand-written responses: defaults are free to maintain, while hand-written values test branches that depend on realistic data.", "Mock everything versus mock selectively: full mocks maximize speed, while selective mocks keep the real provider for what matters most and cost credentials."],
    p: ["Tests pass against a mock that accepts a value the real service rejects, so the failure appears only in production.", "Mock data copied once from a real response goes stale as the provider schema evolves."],
    v: "Run a test with the real provider unconfigured and no credentials set, using a mock that returns a fixed identifier, and confirm assertions on that identifier pass in under a second.",
    dep: ["test-framework","provider-schemas"]
  },
  "scheduled-drift-checks": {
    s: "Recurring plan-only runs that compare real infrastructure to state and configuration and alert when something was changed outside the tool.",
    d: "A scheduler triggers a refresh-only or normal speculative plan on each workspace at an interval. If the plan finds differences, the service records a drift event, notifies owners and may open a ticket. Some systems add a continuous validation pass that runs checks and reports health between deployments. The job needs read credentials and a lock-free plan. It is hard because noise is high: attributes that providers normalize or that other systems change legitimately appear as drift, so rules must ignore known churn.",
    k: ["Alert only versus auto-remediate by applying: alerting keeps humans in control, while auto-apply restores desired state quickly but can overwrite an emergency fix.", "Frequent checks versus infrequent: frequent checks shorten the window of unnoticed change, but raise API cost and rate-limit risk."],
    p: ["An emergency manual fix is reverted overnight by an auto-remediating run, repeating the incident.", "Drift reports full of provider-normalized attributes are ignored, so real drift is missed."],
    v: "Change a tag on a managed object by hand, wait for the next scheduled run, and confirm a drift event names the object and attribute and that an alert reaches the owner.",
    dep: ["refresh-and-drift","run-queue","targeted-plans"]
  },
  "blocks-and-attributes": {
    s: "The basic syntax: named, typed blocks with labels that contain attributes and nested blocks, giving configuration a regular structure that tools can read, format and rewrite.",
    d: "A file is a sequence of blocks. Each block has a type, optional labels, and a body of attributes assigned to expressions plus nested blocks. Top-level types include resource, data, variable, output, module, provider and locals. The parser produces a syntax tree that keeps comments and positions for diagnostics and formatting. The schema for each block comes from the core or from a provider, and decoding is driven by it. This regularity is what makes tooling possible, at the price of a deliberately limited syntax with no loops or statements.",
    k: ["Declarative blocks versus a general-purpose programming language: blocks are analyzable and safe to evaluate, but complex logic needs awkward expression tricks.", "Order-independent declarations versus sequential steps: order independence lets the tool compute dependencies, but readers cannot see execution order from the file."],
    p: ["Duplicate block labels across files in one directory are an error that appears only after files are merged by the loader.", "Putting everything in one file hides structure, and moving blocks between files looks like large diffs."],
    v: "Parse a file with a resource block, a nested block and a comment, format it, and confirm the syntax tree retains the comment and that a malformed block reports file, line and column.",
    dep: ["configuration-loader"]
  },
  "expression-evaluator": {
    s: "The component that evaluates expressions over references, operators, conditionals and function calls, within a scope of variables, locals, resource attributes and iteration values.",
    d: "Expressions are parsed into trees and evaluated lazily against a scope built per object. A reference to another object returns its attribute values, which may be unknown during planning. The evaluator propagates unknown and sensitive marks through every operation, so a function applied to an unknown value yields an unknown result. Diagnostics point to the failing sub-expression. It is hard because evaluation happens repeatedly in different phases: static validation, planning and applying each see different known values, and errors must be reported precisely, not at the first symptom.",
    k: ["Lazy evaluation per attribute versus eager evaluation of everything: lazy evaluation lets objects wait for dependencies, but makes error timing depend on the walk order.", "Marking values as unknown versus failing on missing data: marks let plans proceed with partial knowledge, but every function must define behavior for unknown inputs."],
    p: ["A conditional on an unknown value cannot choose a branch, so the plan fails or leaves the whole attribute unknown.", "Error messages that cite the final failing function rather than the root input send people to the wrong line."],
    v: "Evaluate an expression that references an unknown attribute and confirm the plan shows it as known after apply, while an expression using only variables shows its exact value in the plan.",
    dep: ["blocks-and-attributes","type-system","built-in-functions"]
  },
  "type-system": {
    s: "Primitive and structural types, such as strings, numbers, lists, maps, objects and tuples, with automatic conversion rules and optional attributes that variables and outputs can declare.",
    d: "Values have types: primitives, collections of one element type, and structural types with named or positional elements. Conversions between compatible types happen automatically, for example a number to a string, so interfaces are forgiving. Variables can declare a type constraint and defaults, including object attributes that are optional with defaults. A dynamic pseudo-type means any. Type errors surface during validation with the path to the offending element. The difficulty is the conversion rules themselves: they are convenient but surprising at edges, such as when a list becomes a tuple.",
    k: ["Strong constraints on module interfaces versus any-typed inputs: constraints catch mistakes at the boundary, but break callers when tightened later.", "Implicit conversion versus explicit casts: implicit conversion reduces noise, but hides data changes that surprise users."],
    p: ["A variable typed as any passes through bad data that fails deep inside a resource with a confusing message.", "Changing a variable type from a list to a set reorders elements and silently changes resource addresses."],
    v: "Pass a map where a list of strings is expected and confirm validation fails before any plan, with an error naming the variable and the offending element.",
    dep: ["expression-evaluator"]
  },
  "built-in-functions": {
    s: "A fixed library of pure functions for strings, numbers, collections, encoding, hashing, dates, filesystem reads and network address math, available inside any expression.",
    d: "Functions are deterministic and side-effect-free apart from a few that read local files, which are allowed because file content becomes part of the configuration. The set covers string formatting, collection transforms, merge and lookup, JSON and base64 encoding, hashing, CIDR arithmetic and time formatting. Each declares parameter types and a return type that the evaluator checks. The library is closed to users by design, and extension happens through provider-defined functions. It is hard to evolve: adding or changing a function's behavior can alter existing plans.",
    k: ["A closed standard library versus user-defined functions: a closed set keeps configuration readable and analyzable, but forces workarounds for missing operations.", "Pure functions only versus allowing external calls: purity keeps plans repeatable, while external calls are handled separately through data sources."],
    p: ["A timestamp function in a resource attribute changes on every plan and forces constant updates.", "Reading a file with a function embeds its content, so a missing file on a pipeline runner fails differently from a developer machine."],
    v: "Call a CIDR-splitting function with fixed input in two separate runs and confirm identical outputs, then call a timestamp function and confirm the second plan reports a change.",
    dep: ["expression-evaluator","type-system"]
  },
  "template-strings": {
    s: "String interpolation and directives that embed expressions, conditionals and loops inside quoted and multi-line strings, used for names, policies and generated file content.",
    d: "Inside a string, an interpolation sequence evaluates an expression and converts the result to text; directive sequences add conditional and repeated sections, with markers to trim whitespace. Multi-line heredoc strings hold scripts and documents. A separate template function renders a file with a supplied variable map, evaluated lazily so references resolve late. The parser has to handle nesting and escaping correctly. Difficulty comes from whitespace control and from unknown values: an interpolation of an unknown makes the whole string unknown.",
    k: ["Inline interpolation versus structured encoding functions: interpolation is quick, but building JSON by string concatenation breaks on quotes, where encoders do not.", "Templates in files versus in strings: separate files are easier to edit and lint, but add a file dependency to every module."],
    p: ["Hand-built JSON policies with interpolated values produce invalid documents when a value contains a quote.", "Whitespace differences in a heredoc make a resource look changed even though meaning is the same."],
    v: "Render a template with a loop over three items and confirm exact output with expected line breaks; then interpolate an unknown value and confirm the plan marks the whole string unknown.",
    dep: ["expression-evaluator","built-in-functions"]
  },
  "for-expressions-and-splats": {
    s: "Expressions that build lists and maps by transforming and filtering collections, and shorthand that reads one attribute from every element of a collection of resources.",
    d: "A for expression iterates over a list, set, map or object, optionally filters with a condition and produces a tuple or object, with grouping when keys repeat. A splat extracts an attribute from each element, so one reference reads the identifiers of every instance created by count or for-each. Results keep element order for lists and sort by key for maps. The difficulty is that the shape of the result depends on input values: when the collection is unknown, so is its length and shape, which limits what planning can decide.",
    k: ["Build collections with for expressions versus separate resources per item: expressions keep configuration compact, while explicit items give every object a stable and readable address.", "Key by stable identifier versus by position: stable keys survive reordering, while positions are simpler but shift on removal."],
    p: ["Duplicate keys in a for expression that builds a map fail only when two inputs happen to collide.", "Iterating over a set of unknown size makes downstream expansion impossible until apply."],
    v: "Transform a list of three names into a map with a filter, confirm the plan shows the exact keys, and confirm a splat over three instances returns three identifiers after apply.",
    dep: ["expression-evaluator","type-system"]
  },
  "dynamic-blocks": {
    s: "A construct that generates repeated nested blocks inside a resource from a collection, since nested blocks cannot be produced by ordinary expressions.",
    d: "Some resource schemas use repeated nested blocks, such as ingress rules or disk definitions, and attributes cannot hold them. A dynamic block names the nested block type, iterates a collection and sets the content once per element, exposing an iterator with key and value. Evaluation happens when the configuration is decoded against the schema, so the collection must be known well enough to count blocks. It is hard to read and debug: heavy use turns declarative configuration into a template, hiding what will be created.",
    k: ["Dynamic blocks versus repeated literal blocks: dynamic blocks remove duplication, but literal blocks are easier to read and review.", "Generated nested blocks versus separate child resources: separate resources give each item its own lifecycle, while nested blocks replace the whole set together."],
    p: ["Overuse makes plans hard to review because the resulting blocks never appear in the source.", "Unknown collection values block planning, since the number of nested blocks cannot be determined."],
    v: "Generate three rule blocks from a list, confirm the plan shows three nested blocks, then remove one list element and confirm only that block is planned for removal.",
    dep: ["blocks-and-attributes","for-expressions-and-splats","schema-decoding"]
  },
  "json-syntax": {
    s: "An equivalent JSON encoding of the configuration language, intended to be generated and read by other programs while remaining loadable alongside normal files.",
    d: "Files with a JSON extension are parsed into the same internal body model as native syntax. Block labels become nested object keys, and expressions are written as strings that contain template syntax. A directory may mix both syntaxes. This lets code generators and higher-level tools emit configuration without writing the native format. The mapping is lossy for humans: JSON has no comments, ordering is less meaningful, and block versus attribute is ambiguous without the schema, so decoding always needs the schema to disambiguate.",
    k: ["Generate JSON versus generate native syntax: JSON is easy to emit and parse from other tools, while native files are readable and carry comments.", "Mixed syntaxes in one module versus one syntax: mixing supports generated overrides, but makes code reviews harder."],
    p: ["Generators that emit expressions as plain strings forget the template wrapper, so values are treated as literal text.", "Comments cannot survive a round trip through JSON, so formatting tools drop them."],
    v: "Write the same resource in both syntaxes in two files of separate directories and confirm both produce identical plans, including the same dependency edges.",
    dep: ["blocks-and-attributes","schema-decoding"]
  },
});
