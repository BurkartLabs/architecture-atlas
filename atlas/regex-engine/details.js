// Details for the regular expression engine plate, part 1: API, verification, cross-cutting concerns.
ATLAS.details("regex-engine", {
  "compile-api": {
    s: "The entry point that turns pattern text and options into a reusable compiled object, with a builder for settings such as size limits, flags and which engines may be used.",
    d: "Compilation parses, analyzes, lowers and optimizes the pattern once, and returns an immutable object that is cheap to search with many times. A builder style lets callers set syntax flavor, case folding, Unicode mode, size and memory limits, and engine permissions before building. Compilation can cost milliseconds and megabytes, so the API must make reuse the default and make the cost visible. The hard part is that callers often compile inside loops, so a convenient one-shot function becomes a performance bug.",
    k: ["Immutable compiled object versus mutable matcher state: sharing across threads is trivial, but scratch memory must live elsewhere and be passed in or pooled.", "Builder with explicit limits versus fixed defaults: services can bound untrusted patterns, at the cost of more settings callers must understand."],
    p: ["Compiling the same pattern on every request inside a hot loop, which dominates CPU and allocates heavily.", "Treating compile errors as impossible for patterns built from user text, so a bad pattern crashes the request."],
    v: "Compile one pattern, run it from eight threads at once on different inputs, and confirm identical results with no locking on the compiled object. Compile a loop of one million calls and confirm the cache or reuse path avoids recompiling.",
    dep: ["tokenizer", "tree-simplifier", "thompson-construction", "engine-selector", "program-size-limit"]
  },
  "match-api": {
    s: "The basic search calls: does it match anywhere, where is the first match, and does it match the whole input or only at a given position.",
    d: "A boolean test, a find returning a span, and anchored variants that require the match to start at the search start or cover the entire input. The boolean form is the cheapest because no match bounds or captures are needed, so the engine can stop at the first sign of a match and skip a reverse scan. Callers choose the form that tells the engine how little information it must produce. The difficulty is semantics: full-match versus search, and what an unanchored search means once a start offset is given.",
    k: ["Separate is-match and find calls versus one find call: the cheaper boolean path is explicit, at the cost of a larger API.", "Anchored mode as a search option versus pattern text: callers can reuse one compiled pattern both ways, but the two behaviors need separate start states."],
    p: ["Calling find to answer a yes/no question and paying for span computation that is then discarded.", "Assuming a whole-input match is just a search with anchors, then getting different results when alternation has a shorter first branch."],
    v: "On a 1 MB input with a match at the very start, time the boolean test and the find call and confirm the boolean version does no reverse scan. Confirm a whole-input call rejects a prefix-only match.",
    dep: ["engine-selector", "search-window", "span-and-offset-types", "search-pipeline"]
  },
  "match-iteration": {
    s: "Iterates over all non-overlapping matches in an input, advancing the search position after each match and handling empty matches without looping forever.",
    d: "Each step searches from the end of the previous match, passing the earlier text as context so anchors and boundaries behave as if the whole input were seen. A match that is empty must advance by one character, not one byte, or the next match will start inside a code point. Iterators reuse one scratch cache across steps so allocation does not repeat. The hard parts are consistency with replace and split, and overlapping search semantics when callers ask for them.",
    k: ["Lazy iterator versus collecting all matches: no allocation for early exit, but the borrowed input and scratch state complicate the API.", "Searching from the previous end with context versus slicing the input: slicing is simpler but breaks lookbehind, boundaries and start-of-text anchors."],
    p: ["Slicing the remaining text for each step, which changes what anchors and word boundaries mean.", "Advancing one byte after an empty match in UTF-8 text and reporting a match inside a character."],
    v: "Run an empty-matching pattern over a string with multi-byte characters and confirm one match per character boundary, none inside a character, and termination. Compare the counts with iteration using full context.",
    dep: ["match-api", "empty-match-advance", "scratch-cache-pool", "search-window"]
  },
  "capture-api": {
    s: "Returns the spans of numbered and named groups for a match, and tells callers which groups did not participate.",
    d: "Captures need the most expensive execution path, because the engine must track which positions each group entered and left. The API therefore asks for captures separately from a plain match, usually after the span is known, so only the matched region is rerun. Named groups map to indices at compile time. Groups inside repetitions report their last iteration. The hard part is that unmatched groups differ from empty-matched groups, and callers conflate the two.",
    k: ["Capture slots in a caller-owned buffer versus allocated per call: no allocation in hot loops, but the buffer sizing and lifetime become the caller's concern.", "Rerunning on the known span versus capturing during the first scan: the first scan stays fast, but captures cost a second pass."],
    p: ["Treating an unmatched optional group as an empty string and processing data that was never present.", "Requesting captures for every match in a large input when only the overall span is needed, multiplying cost several times."],
    v: "Match an optional group against input that omits it and confirm the API reports it as absent, not empty. Time a find-all with and without captures on the same input and confirm the cost difference matches expectation.",
    dep: ["capture-slot-allocation", "nfa-thread-simulation", "one-pass-matcher", "bounded-backtracker", "search-pipeline"]
  },
  "replace-and-split": {
    s: "Builds new strings from matches by expanding replacement templates that refer to groups, and splits input at match boundaries.",
    d: "Replace iterates matches, copies the text between them, and expands a template with group references by index or name. Callers can also pass a function that computes each replacement. Split uses the match spans as separators, with rules for leading and trailing empty fields and for limits on the number of pieces. Difficulty comes from template syntax ambiguity, such as a reference followed by a digit, and from empty matches, which must insert at every character boundary exactly once.",
    k: ["Template strings versus callback replacement: templates are safe and declarative, callbacks allow arbitrary logic but must run inside the iteration and can reenter the engine.", "Expanding in one pass into a buffer versus building a list of pieces: one pass avoids copies but needs the output size bounded for untrusted templates."],
    p: ["A replacement template that treats a literal dollar sign as a group reference, corrupting output or raising errors on user text.", "Splitting with an empty-matching pattern and getting fields that differ from the expected character split."],
    v: "Replace with a template referencing groups by name and index, then replace an empty-matching pattern in a multi-byte string and confirm insertion points are one per character boundary with correct group expansion.",
    dep: ["match-iteration", "capture-api", "empty-match-advance"]
  },
  "set-match-api": {
    s: "Matches many patterns against one input in a single scan and reports which patterns matched, optionally with positions.",
    d: "Patterns are compiled together into one automaton whose accepting states are tagged with pattern identifiers. A scan then reports every pattern that matched, which is far faster than running each pattern separately when the set is large, as in routing rules or content filters. The basic form reports only identifiers; position and capture reporting need a second pass per matching pattern. The hard part is state growth: combining thousands of patterns can multiply states, so memory limits and fallbacks matter.",
    k: ["One combined automaton versus separate automata run in turn: a single pass wins on large sets, but combined state count can grow beyond the cache budget.", "Identifiers only versus full match spans: the first is a single linear scan, while spans require rerunning individual patterns on candidates."],
    p: ["Assuming the set reports which pattern matches first in the input, when it reports only that a match occurred somewhere.", "Adding patterns without watching combined size, so the set silently falls to the slow engine."],
    v: "Build a set of five hundred patterns, scan a large input once, and confirm the reported identifiers equal those from running each pattern individually, in less total time.",
    dep: ["multi-pattern-dfa", "multi-substring-search", "compile-api", "program-size-limit"]
  },
  "streaming-api": {
    s: "Searches input that arrives in pieces from a reader or network, without requiring the whole text in memory, and reports matches with absolute offsets.",
    d: "The caller feeds chunks or supplies a reader. The engine keeps matcher state across chunk boundaries, so matches that span two chunks are found. Only automaton-style engines support this naturally, because they hold a small state; backtracking engines need the text behind them. Offsets are tracked as absolute positions. The hard part is lookbehind, boundary assertions and captures at the seam, where the engine needs bytes it has already released.",
    k: ["Resumable automaton state versus buffering a window of text: state is small and exact, while buffering supports more features but needs a bound on match length.", "Reporting matches as soon as found versus at end of stream: lower latency, but leftmost-first semantics can require waiting to see whether a longer alternative applies."],
    p: ["A match that crosses a chunk boundary is missed because only the chunk text was scanned.", "Unbounded buffering when a pattern can match arbitrarily long text, giving unpredictable memory use."],
    v: "Split the same input at every possible byte offset into two chunks and confirm the match set is identical to searching the whole input, including a match spanning the split.",
    dep: ["chunked-input", "lazy-dfa", "nfa-thread-simulation", "span-and-offset-types"]
  },
  "error-reporting": {
    s: "Reports why a pattern failed to compile, with position and category, distinguishing syntax mistakes from size or feature limits.",
    d: "Parse errors carry the offending span and a kind such as unclosed group, bad escape, repetition of nothing, or unsupported feature. Limit errors say which limit was hit, such as program size or nesting depth. Messages show the pattern with a pointer to the position. Errors must be safe to show to users who wrote the pattern, and structured enough for programs that map them to responses. Difficulty is accuracy: errors found late in a nested construct often point far from the real mistake.",
    k: ["Structured error kinds versus message strings only: programs can react to specific failures, but kinds become public API that must stay stable.", "Stopping at the first error versus collecting several: a first error is simple and accurate, while multiple errors help editors but risk cascading false reports."],
    p: ["Echoing a user-supplied pattern in an error that reaches logs or web pages without escaping.", "Reporting a generic failure for size-limit errors, leaving users unable to tell a bad pattern from a too-large one."],
    v: "Feed twenty known-bad patterns and confirm each yields the expected error kind and a position that points at the faulty token. Confirm an oversized pattern reports the size limit by name.",
    dep: ["tokenizer", "program-size-limit", "nesting-depth-limit"]
  },
  "option-flags": {
    s: "The settings that change how a pattern is read and matched: case insensitivity, multiline, dotall, Unicode mode, extended whitespace and greedy swap.",
    d: "Flags can be passed at compile time or switched inline for part of a pattern, and they alter both parsing and matching. Case insensitivity rewrites literals and classes; multiline changes what the line anchors match; dotall changes the any-character class. The parser applies flags as it walks the pattern and records their effect in the tree, so later stages never see flags, only the rewritten structure. The hard part is interactions, such as Unicode mode changing what counts as a word character.",
    k: ["Resolving flags in the parser versus carrying them to execution: later stages stay simple and fast, but a flag change inside the pattern can require duplicating subtrees.", "Defaults off versus on for Unicode: on is correct for text but slower and larger, off is faster but gives surprises on non-ASCII input."],
    p: ["Enabling case insensitivity without Unicode mode and silently missing case pairs outside ASCII.", "Assuming a flag applies globally when inline syntax scopes it to a group."],
    v: "Match the same pattern against ASCII and non-ASCII text under each flag combination and confirm results equal a hand-computed table, including a scoped inline flag that ends at the closing group.",
    dep: ["inline-flag-scoping", "case-fold-rewrite", "line-mode-semantics", "compile-api"]
  },
  "language-bindings": {
    s: "Wrappers that expose the engine to other languages through a stable foreign interface, with matching string, offset and error conventions.",
    d: "A bridge layer maps host strings to the byte or code point view the engine expects, converts offsets back to the host's unit, and turns errors into host exceptions. Compiled objects are held by handles whose lifetime follows the host's garbage collector or explicit close. Calls cross a boundary that costs time, so batching find-all is far cheaper than many single calls. The difficulty is offset units: a host string indexed by UTF-16 units makes byte offsets from the engine wrong without conversion.",
    k: ["Thin binding exposing engine offsets versus full host-native API: thin is easy to keep correct, while native feels natural but must reimplement conversions and edge cases.", "Copying the haystack into engine memory versus borrowing it: copying is safe, borrowing avoids doubling memory but pins the host object during the call."],
    p: ["Reporting byte offsets to a host expecting character offsets, so every slice after a multi-byte character is wrong.", "Freeing a compiled handle while another thread is mid-search."],
    v: "Search text containing multi-byte and astral characters through the binding and confirm returned offsets slice the host string to exactly the matched text. Run the binding under a leak checker over a million compile and close cycles.",
    dep: ["compile-api", "match-api", "span-and-offset-types", "thread-sharing"]
  },

  "reference-differential": {
    s: "Compares this engine's results against other independent engines on the same patterns and inputs, so disagreements expose bugs in either one.",
    d: "A harness generates or collects pattern and input pairs, runs each engine, and compares match spans and captures after normalizing known intentional differences. Disagreements are triaged into bugs, flavor differences and reference bugs. Engines using different algorithms, such as backtracking against automata, make unrelated mistakes, so agreement is strong evidence. The hard part is the expected-difference list: leftmost-longest versus leftmost-first, group capture in repetition and Unicode versions all differ legitimately.",
    k: ["Comparing against several references versus one: a vote isolates the odd engine, but each adds integration work and its own known quirks.", "Strict equality versus a normalized comparison: strict finds more, but floods triage with accepted flavor differences."],
    p: ["Tuning the normalization until the diff goes quiet, which hides real bugs behind the allowance list.", "Testing only generated patterns that avoid features where engines differ, which is exactly where bugs live."],
    v: "Run one million generated pattern and input pairs against two reference engines and confirm every disagreement is either filed as a bug or listed in the documented-difference table with a reason.",
    dep: ["compile-api", "match-api", "capture-api", "fuzz-harness"]
  },
  "conformance-corpus": {
    s: "A fixed collection of patterns, inputs and expected spans from specifications and past bugs, run on every change to guard behavior.",
    d: "The corpus is stored as data files so any engine can run them: pattern, flags, input, expected match list and group spans, grouped by feature. It includes entries from standards, from other engines' public test suites where licenses allow, and from every bug fixed in this engine. Each fixed bug adds a case. The corpus runs against every execution engine separately, forcing each one to give the same answer. The hard part is expressing expected failure and engine-specific limits.",
    k: ["Data-driven corpus versus tests written in code: data runs against any engine and language binding, but cannot express setup such as limits or streaming splits.", "Running each case on every engine versus on the default: catches divergence between engines, at several times the test cost."],
    p: ["A corpus that only runs the default engine, so a rarely selected engine drifts away from the others.", "Expected results copied from the engine's own output, locking in bugs as correct."],
    v: "Run the corpus once per engine with the selector forced to that engine, and confirm identical pass sets. Add a deliberate bug to one engine and confirm a specific case fails.",
    dep: ["engine-selector", "option-flags", "match-api"]
  },
  "fuzz-harness": {
    s: "Generates random and mutated patterns and inputs to find crashes, hangs, memory blowups and disagreements between the engine's internal matchers.",
    d: "Fuzzers are coverage-guided and use grammar-aware mutation so patterns are mostly valid. Oracles include no crash or panic, bounded time and memory, and agreement between execution engines forced one at a time on the same input. Because the engine promises limits, a hang or oversized allocation is a failure. Inputs generated from the pattern's own literals reach deep states that random bytes never reach. The difficulty is a good oracle for correctness, which is why internal cross-engine comparison is the main one.",
    k: ["Grammar-aware generation versus raw byte mutation: structured input reaches deep compiler paths, while raw bytes find parser bugs; both are needed.", "Internal cross-engine oracle versus external reference: internal needs no other engine and runs fast, but shared code such as the parser hides common faults."],
    p: ["Running without timeouts or memory caps, so the fuzzer finds nothing because every hang is silently killed or ignored.", "Only mutating inputs for fixed patterns, never exercising the compiler."],
    v: "Run the fuzzer for a fixed budget with a seeded planted defect in the DFA cache eviction path and confirm it is found as a disagreement with the thread simulation, and report the minimized case.",
    dep: ["engine-selector", "step-counters", "reference-differential", "tokenizer"]
  },
  "step-counters": {
    s: "Counts work done per search, such as steps, states visited and cache rebuilds, and enforces a budget so slow patterns stop instead of hanging.",
    d: "Each matcher increments a counter on its inner loop or at state transitions. When the counter passes a budget the search returns an error or falls back to a linear engine. The same counters feed diagnostics showing how much work a pattern costs per byte. Counting must be cheap enough not to slow the inner loop, so it is checked at coarse points such as every thousand steps. The hard part is choosing a unit comparable across engines.",
    k: ["Step budget versus wall-clock timeout: steps are deterministic and testable, while time reflects real cost but varies by machine and load.", "Counting in the inner loop versus at coarse checkpoints: exact limits cost speed, so checkpoints trade a small overshoot for lower overhead."],
    p: ["A budget that is exceeded in one engine but never counted in another, leaving a path with no limit.", "Reporting step counts as a performance measure across machines, when they measure algorithm work and not time."],
    v: "Run a known catastrophic pattern against a hostile input with a budget of one million steps and confirm the search returns the budget error in under one second, with the counter near the limit.",
    dep: ["backtracking-matcher", "recursion-limit", "cancellation-and-timeouts"]
  },
  "match-tracing": {
    s: "Optional diagnostic output showing which engine ran, which prefilter fired, how states were built and where a match attempt failed.",
    d: "Tracing records the decisions of the selector, the literal scan hits and rejections, DFA states created and evicted, and for backtracking the sequence of attempted branches. It is compiled out or disabled by default because the inner loops cannot afford checks. Developers use it to understand why a pattern is slow or why it matched an unexpected span. The hard part is making output readable, since a single search can produce millions of events, so summaries and sampling matter.",
    k: ["Compile-time disabled tracing versus runtime switch: zero cost when off, but a production problem cannot be traced without a rebuild.", "Event stream versus summary counters: a stream allows exact replay, while counters stay small and are safe to leave on in production."],
    p: ["Leaving verbose tracing enabled and slowing every search by an order of magnitude.", "Tracing that records input text and leaks private data into logs."],
    v: "Trace one search on a pattern with a required literal and confirm the output shows which engine was chosen, the literal position tried, and which candidate positions the automaton confirmed or rejected.",
    dep: ["engine-selector", "search-pipeline", "step-counters"]
  },
  "benchmark-suite": {
    s: "A repeatable set of timed patterns and inputs covering literals, alternations, classes, captures, Unicode and worst cases, tracked across versions.",
    d: "Benchmarks measure throughput in bytes per second and compile time, per engine and per pattern family, on fixed corpora with sizes that exceed cache. Results are stored per commit so regressions show as lines. Cases include the hostile ones: patterns that are slow for backtracking and inputs that force DFA cache thrash. The hard part is realism, since microbenchmarks on tiny inputs favor setup cost and ignore the memory behavior that dominates real use.",
    k: ["Synthetic worst cases versus real workload corpora: synthetic cases pin down algorithmic limits, while real corpora show what users actually experience.", "Measuring throughput versus latency of first match: throughput suits scanning, while latency matters for validation of short strings."],
    p: ["Benchmarking on small inputs that stay in cache, hiding slowdowns that appear once the working set exceeds it.", "Comparing runs from different machines or power states and reading noise as regression."],
    v: "Run the suite on two consecutive commits on the same idle machine and confirm results repeat within a few percent, then reintroduce a known slowdown and confirm the affected family drops visibly.",
    dep: ["match-api", "engine-selector", "vector-byte-scan"]
  },
  "pattern-linter": {
    s: "Static checks that flag patterns likely to be slow, wrong or unintended, such as nested unbounded repetition or an unescaped dot, before they ship.",
    d: "The linter walks the tree after parsing and reports ambiguous nested quantifiers, alternations whose branches overlap, groups that can never match, anchors in impossible positions and character classes with duplicated ranges. For backtracking flavors it estimates worst-case growth from ambiguity. It reuses property analysis and the same tree as the compiler. The hard part is precision: warning on every nested repetition is noise, but detecting true exponential ambiguity needs automata analysis.",
    k: ["Syntactic heuristics versus ambiguity analysis on the automaton: heuristics are fast and simple, while automaton analysis finds real exponential cases with fewer false alarms.", "Warnings versus hard errors: warnings keep legacy patterns working, but errors are the only thing that stops dangerous ones in new code."],
    p: ["Warning on benign patterns until teams disable the linter entirely.", "Treating a pattern as safe because it lints clean, when only its structure, not its input, was examined."],
    v: "Lint a set of known catastrophic patterns and known safe ones and confirm every catastrophic pattern is flagged with the ambiguity location and the safe set produces no warnings.",
    dep: ["ast-nodes", "property-analysis", "feature-detection"]
  },

  "linear-time-guarantee": {
    s: "The decision whether every search must finish in time proportional to pattern size times input size, which rules out some features and shapes the whole engine.",
    d: "Automata guarantee linear time but cannot support backreferences and need extra work for lookaround and captures. Backtracking supports every feature but can take exponential time. Choosing a guarantee decides the feature set, the execution engines kept, the parser's rejections and what an adversarial pattern or input can do to a server. It is a cross-cutting concern because a single unbounded construct in any layer breaks the promise for all patterns that use it.",
    k: ["Guaranteed linear time versus full feature coverage: guarantee protects services from hostile input, while extra features need an exponential-risk engine and its defenses.", "Rejecting unsupported features at compile time versus falling back to slow matching: rejection is predictable, fallback is convenient but silently breaks the promise."],
    p: ["Advertising a linear guarantee while a fallback engine for one feature has no budget.", "Linear in input but exponential in pattern size, so a hostile pattern still exhausts resources."],
    v: "Search a megabyte of adversarial input with a known catastrophic pattern and confirm time grows linearly when input is doubled, then confirm patterns outside the guarantee are rejected or budgeted explicitly.",
    dep: ["engine-selector", "backtracking-matcher", "lazy-dfa", "nfa-thread-simulation", "step-counters"]
  },
  "flavor-compatibility": {
    s: "The decision which existing syntax and semantics must be reproduced exactly, since users bring patterns written for other engines and expect identical results.",
    d: "Flavors differ in escapes, class syntax, group syntax, which features exist and, more subtly, in semantics: leftmost-first versus leftmost-longest alternation, how captures behave inside repeats, what an empty loop does, and what the word boundary means. Compatibility touches the parser, the compiler and each execution engine, which must agree on the same disambiguation rule. Full compatibility pins the design to another engine's historical behavior, including its bugs.",
    k: ["Matching one existing flavor versus a clean new syntax: compatibility lets patterns port unchanged, while a new design can drop confusing features.", "Several flavors from one core versus separate parsers sharing nothing: one core limits duplication, but flavor-specific semantics leak into shared stages."],
    p: ["Accepting a flavor's syntax but matching with different alternation rules, so ported patterns return different spans without any error.", "Documenting syntax compatibility and not semantic differences, which are the ones users hit."],
    v: "Run a corpus of ported patterns against the original engine and this engine and confirm identical spans and captures, with every divergence listed in a published differences table.",
    dep: ["flavor-grammars", "match-semantics-modes", "priority-ordering", "reference-differential"]
  },
  "resource-limits": {
    s: "The caps on pattern size, nesting, automaton memory, cache memory, search steps and result sizes that keep any one call from consuming unbounded resources.",
    d: "Every stage that can grow needs its own limit: parse depth, repeat counts, compiled program bytes, DFA cache bytes, backtrack stack, number of states, output buffer. Limits must produce clean errors or fallbacks, and the defaults must be safe for services but usable for ordinary patterns. Limits interact, because a repeat count of one thousand nested inside another multiplies. The difficulty is that a limit missing in one stage becomes the attacker's route.",
    k: ["Hard errors at the limit versus graceful fallback to a slower engine: errors are predictable, while fallback keeps more patterns working but hides cost.", "Per-pattern limits versus a global budget: per-pattern is simple to explain, while a global budget protects the process from many moderate patterns at once."],
    p: ["Limiting program size after expansion in one place but not in another stage, so large repeat counts blow memory before the check.", "Defaults tuned for tests that real patterns exceed, causing users to disable the limit."],
    v: "Compile patterns of increasing repeat nesting and confirm each stage stops at its limit with a distinct error, and that peak memory during failure stays within a fixed multiple of the configured cap.",
    dep: ["program-size-limit", "nesting-depth-limit", "memory-accounting", "cache-eviction", "recursion-limit"]
  },
  "untrusted-pattern-safety": {
    s: "The decisions that make it safe to compile patterns or run searches from untrusted sources, covering time, memory, output size and information disclosure.",
    d: "Untrusted patterns can request exponential time, huge automata or enormous replacement output. Untrusted input can hit worst-case behavior in a vulnerable pattern. Safety requires linear-time or budgeted engines, size limits at every stage, bounded caches, no unbounded recursion, and error messages that do not leak. It is cross-cutting because it depends on every limit working together. The hard part is that safe defaults conflict with compatibility, so patterns that worked before are refused.",
    k: ["Safe mode with restricted features versus full features with budgets: restricted is provably bounded, while budgets keep compatibility but need monitoring.", "Compiling untrusted patterns in-process versus in a separate sandboxed process: in-process is fast, while isolation contains bugs and memory blowups."],
    p: ["Protecting only the match path while the compiler can still be driven to exhaust memory by a hostile pattern.", "Assuming input alone is untrusted, so a vulnerable pattern in the code base is fine."],
    v: "Submit a corpus of known hostile patterns and inputs under the safe configuration and confirm every one terminates within a fixed time and memory ceiling with a clean error or result.",
    dep: ["linear-time-guarantee", "resource-limits", "step-counters", "error-reporting"]
  },
  "unicode-policy": {
    s: "The decision whether patterns and input are bytes or code points, which Unicode version is used, and how invalid text and case rules are handled.",
    d: "Matching on bytes is fast and simple, but users write classes and case-insensitive patterns in terms of characters. Unicode mode makes a dot match a whole code point and classes cover whole scripts, which expands automata and needs property tables. The policy also decides what happens on invalid UTF-8, whether the table version is pinned, and whether word boundaries follow Unicode or ASCII. These choices change compiled size, speed and results, and cut through the parser, compiler and every matcher.",
    k: ["Code point semantics versus raw byte semantics: code points match user expectations, while bytes are faster and work on binary data.", "Pinned Unicode version versus tracking the latest: pinning keeps results stable, while updating fixes classifications for new characters but may change behavior."],
    p: ["Using Unicode classes in a pattern applied to binary data and getting no matches because bytes are invalid text.", "Upgrading tables and silently changing which characters a class matches."],
    v: "Match a Unicode class and a case-insensitive pattern against text spanning several scripts, including characters needing multi-byte encoding, and confirm results match the published property data for the pinned version.",
    dep: ["utf8-decoding", "unicode-property-tables", "case-folding", "invalid-bytes-policy", "utf8-automata"]
  },
  "cache-and-memory-locality": {
    s: "The decision to design data layouts for the CPU cache, since matching speed is dominated by memory access patterns rather than instruction count.",
    d: "A DFA transition table access is a single dependent load per byte, so table size and layout determine speed: small tables stay in cache, large ones stall. Equivalence classes, state ordering, sparse state sets and compact instruction encoding all exist to shrink the working set. Vector scans operate on contiguous bytes. The tradeoff recurs everywhere: a bigger automaton is faster per byte until it spills out of cache, at which point it is slower than a smaller one.",
    k: ["Dense tables with direct indexing versus compact sparse encodings: dense is the fastest per byte, while sparse saves memory and cache at some lookup cost.", "Large per-pattern caches versus small shared ones: large caches avoid rebuilds, while small ones keep many patterns resident."],
    p: ["Tuning on small inputs and tables that fit cache, then deploying to many patterns that evict each other.", "Adding a feature that doubles transition width and halves throughput on large patterns."],
    v: "Measure throughput on the same input as pattern size grows and confirm it stays flat while the automaton fits cache, then declines at a known size, matching the measured cache size of the machine.",
    dep: ["byte-equivalence-classes", "dfa-state-cache", "sparse-state-set", "arena-allocation"]
  }
});
