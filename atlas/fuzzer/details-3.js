// Details for the fuzzer plate, part 3: mutation, structure-aware generation, harnesses.
ATLAS.details("fuzzer", {
  "bit-and-byte-flips": {
    s: "The simplest mutations: invert single bits, bytes or short runs of bytes at chosen positions to probe how each part of the input affects behavior.",
    d: "The operator selects an offset and flips one, two or four bits, or a whole byte or word, and the result is executed. Walking such flips across the whole input reveals which bytes influence the path. It needs no knowledge of the format and is cheap, so it dominates early discovery. It feeds the deterministic stage and havoc. It is hard to make effective on structured formats: most flips of a length field or checksum produce an input rejected immediately.",
    k: ["Systematic walking versus random positions: walking is complete and repeatable, random positions reach more varied combinations per run at no guarantee of coverage.", "Small flips versus wider ones: small flips are precise, wider ones change more per run and make bigger jumps in behavior."],
    p: ["Flips in a checksum-covered input are discarded by validation, so most of the budget is wasted.", "Walking every bit of a large input costs far more runs than the input's behavior justifies."],
    v: "Flip each bit of a small known input in turn and confirm the number of distinct coverage outcomes matches a count obtained by running the same variants independently.",
    dep: ["persistent-mode", "edge-coverage"]
  },
  "arithmetic-mutations": {
    s: "Adds or subtracts small values to integers within the input, and substitutes known boundary values, to trigger overflow, off-by-one and sign errors.",
    d: "The operator treats 8, 16, 32 or 64-bit windows as integers in both byte orders, adds small deltas, and replaces them with values such as zero, one, maximum, minimum and powers of two. These are the values that most often break size calculations and comparisons. It runs in the deterministic stage and in random mix. It is hard because it cannot know which windows are integers, so it tries them all, and because the interesting values depend on the target's own constants.",
    k: ["Try all window sizes and byte orders versus guess from structure: trying all is format-agnostic and costs many runs, guessing is cheaper and can miss fields.", "A fixed boundary list versus values learned from comparisons: a fixed list is cheap and generic, learned values hit the actual constants at the cost of instrumentation."],
    p: ["Windows that straddle two fields produce meaningless values and waste effort.", "A target that rejects any negative size never sees the boundary values that would crash it."],
    v: "Fuzz a small function with a known length-overflow defect and confirm that the arithmetic stage alone finds the crash, by logging which operator produced the crashing input.",
    dep: ["bit-and-byte-flips", "comparison-feedback"]
  },
  "block-operations": {
    s: "Inserts, deletes, duplicates, overwrites or swaps whole blocks of bytes within an input to change its size and layout.",
    d: "Operators choose a source range and a destination, then delete a block, insert a random or copied block, clone a region elsewhere or overwrite one range with another. Duplicating a block repeats a record, and deleting one removes a field. These changes exercise length handling, repeated elements and ordering. They run in random mutation and in havoc. They are hard to tune: block length distributions that are too large destroy format validity, and too small changes behave like byte flips.",
    k: ["Small blocks versus large blocks: small blocks keep inputs mostly valid and reach nearby behavior, large blocks make bigger jumps and usually fail validation.", "Copying existing content versus inserting random bytes: copied content stays plausible and repeated structure is reached, random bytes explore unseen values."],
    p: ["Repeated cloning grows inputs until runs slow down and exceed size limits.", "Deleting a block breaks length fields so that nearly every result is rejected as malformed."],
    v: "Apply each block operator to a record-based input and confirm the output length changes as specified and the target reports repeated, missing and moved records in the parsed result.",
    dep: ["bit-and-byte-flips", "input-serialization"]
  },
  "dictionary-mutations": {
    s: "Inserts or overwrites bytes with tokens from a dictionary so that magic values and keywords appear at positions where random mutation would never produce them.",
    d: "The operator picks a token and a position, then either overwrites existing bytes or inserts the token. Dictionary tokens come from the store and from values learned from comparisons. It is the practical way past checks such as a signature or keyword match. It uses the dictionary store and the execution engine. It is hard because position matters: a token placed at a random offset passes lexical checks and usually fails the structural ones that follow.",
    k: ["Overwrite versus insert: overwrite keeps length and structure, insert shifts everything after it and breaks offsets.", "Uniform token choice versus weighting by past success: uniform is simple, weighting uses what worked but can bias against rarely useful tokens."],
    p: ["Tokens inserted past the end of a length-limited field are ignored.", "A dictionary large relative to the rest of the mutation mix pushes out other useful operators."],
    v: "Fuzz a target that requires a particular keyword and confirm from per-operator statistics that dictionary insertions account for the first input that passes the check.",
    dep: ["dictionary-store", "block-operations"]
  },
  "splicing-crossover": {
    s: "Combines parts of two different corpus entries into one input, mixing features that each earned coverage separately.",
    d: "The operator picks two entries, cuts each at a point and joins the head of one to the tail of the other, or copies a region from one into the other. The result can combine a valid header from one input with an unusual body from another. It is useful when two different features are needed together. It reads the corpus. It is hard because blind cuts mostly break format and checksums, and because it only helps when entries are similar enough to give a sensible result.",
    k: ["Splice at random points versus at aligned boundaries: random is generic, aligned boundaries keep structure and need format knowledge.", "Splice from any entry versus from similar ones: any entry adds variety, similar ones increase the share of valid results."],
    p: ["Splicing entries of different formats or versions produces almost entirely invalid inputs.", "Splices are credited to the wrong parent in lineage records and lineage becomes misleading."],
    v: "Take two inputs that each reach a different feature, splice them repeatedly, and confirm a fraction of results reach both features' edges together.",
    dep: ["corpus-store", "seed-metadata"]
  },
  "havoc-stacking": {
    s: "Applies several random mutations in sequence to one input, producing far-from-parent variants that no single operator would reach.",
    d: "A havoc run picks a random count of operators from the full set, such as flips, arithmetic, block moves, token inserts and splices, applies them in order and executes the result. Because stacking compounds, it explores a larger neighborhood than any single step. It is the main source of discoveries after the deterministic stage. It uses all the mutation operators. It is hard because the stack length is a trade-off, and short stacks stay near a known path while long stacks almost always break validity.",
    k: ["Short stacks versus long stacks: short stacks stay near the parent and often remain valid, long ones jump far and mostly fail early.", "Uniform operator choice versus weighted: uniform is robust and unbiased, weighted focuses on productive operators and can lock in early luck."],
    p: ["Stack counts tuned for one format are too aggressive for a strict binary protocol and nearly every result is rejected.", "Stacks always include a size-growing operator, and inputs slowly bloat."],
    v: "Measure the share of havoc outputs the target accepts past its first validation step at several stack lengths and confirm the configured length is in the range with the best new-coverage rate.",
    dep: ["bit-and-byte-flips", "arithmetic-mutations", "block-operations", "dictionary-mutations"]
  },
  "mutator-selection": {
    s: "The logic that chooses which mutation operator to apply at each step, from uniform random choice to weights adapted to observed results.",
    d: "At each mutation the engine draws an operator from a distribution. Simple fuzzers use fixed weights, while adaptive ones update weights from which operators produced new coverage, using the bandit scheduling. Operator statistics are kept per target and sometimes per seed. It sits between the scheduler and the operators. It is hard because credit assignment is unclear when mutations are stacked, and because operator usefulness changes during a campaign.",
    k: ["Fixed weights versus learned weights: fixed weights are predictable and robust, learned weights adapt to the target but can chase noise.", "Global weights versus per-seed weights: global weights have more data, and per-seed weights suit entries with different structure."],
    p: ["Credit goes to whichever operator ran last in a stack, so weights drift toward irrelevant operators.", "Weights converge to a few operators and the rest are never tried again."],
    v: "Log operator choice and result across a campaign and confirm that selection frequencies track measured discovery rates under the adaptive policy and stay uniform under the fixed one.",
    dep: ["bandit-scheduling", "havoc-stacking"]
  },
  "custom-mutators": {
    s: "A plugin interface that lets a target author supply their own mutation and crossover code, tuned to the input format.",
    d: "The fuzzer calls a user-provided function with an input and a random seed, and expects a mutated input back. The function can decode the data, change a field, fix lengths and checksums, then re-encode. Some interfaces also accept custom crossover and trimming. It sits in the mutation stage and can call generators. It is hard because the mutator must be deterministic given its seed, fast, never return invalid memory sizes and compose sensibly with the built-in operators.",
    k: ["Custom mutator replacing built-ins versus supplementing them: replacing keeps inputs valid, supplementing preserves the chance of malformed input finds.", "Mutate decoded structure versus raw bytes with fixups: structure stays valid by design, fixups keep generality but need per-format code."],
    p: ["The mutator is nondeterministic, so recorded seeds no longer reproduce a finding.", "A mutator crash is blamed on the target and filed as a target bug."],
    v: "Run the mutator with the same seed twice and confirm identical outputs, then confirm that its outputs pass the target's validity and checksum checks at a much higher rate than byte-level mutation.",
    dep: ["input-serialization", "grammar-based-generation", "seed-recording"]
  },
  "grammar-definition": {
    s: "A formal description of the input language, as grammar rules or a schema, that generators and mutators use to produce and edit valid inputs.",
    d: "Grammars list productions such as a document containing records, each with typed fields and allowed values, often with weights, length limits and references that tie fields together. They are written by hand from specifications or inferred from sample inputs and the target's parser. They feed generation, tree mutation and reduction. It is hard because real formats have context-sensitive parts a context-free grammar cannot express, and because a grammar that is too strict removes the malformed inputs that find bugs.",
    k: ["Strict grammar versus permissive grammar: strict gets deep fast and cannot produce invalid input, while permissive includes near-valid inputs that test error handling.", "Hand-written versus inferred grammars: hand-written are accurate and costly, inferred are cheap and incomplete."],
    p: ["The grammar follows the specification but the target accepts a different dialect, and generated inputs are rejected.", "A recursive production without depth limits generates inputs too large to run."],
    v: "Generate many inputs from the grammar and confirm a high share of them is accepted past parsing by the target and a reference parser, and a sample covers every production.",
    dep: ["format-templates"]
  },
  "grammar-based-generation": {
    s: "Builds new inputs from scratch by expanding the grammar's rules with random choices, producing valid-by-construction inputs without any seed.",
    d: "The generator starts at the root rule and randomly selects among alternatives, repetition counts and values until only terminals remain, then serializes the result. Weights and depth limits control size and shape. Some generators keep a seed for reproducibility and some use coverage feedback to bias choices. It uses the grammar and writes to the serializer. It is hard because uniform sampling rarely produces deep, interesting combinations, and generation alone ignores what earlier runs learned.",
    k: ["Pure generation versus mutating existing trees: generation provides variety, while mutation builds on inputs that already earned coverage.", "Uniform choices versus feedback-biased choices: uniform is unbiased, feedback reaches deeper at the cost of added machinery."],
    p: ["Generated inputs are all shallow and valid, never touching error-handling paths.", "Depth limits keep inputs small and cut off constructs that need nesting to trigger a bug."],
    v: "Generate a thousand inputs and confirm the proportion accepted by the target is near the expected valid rate and that coverage reached exceeds that of byte mutation from an empty start in equal time.",
    dep: ["grammar-definition", "input-serialization"]
  },
  "tree-mutation": {
    s: "Mutates an input's parsed tree by replacing, deleting, duplicating or swapping subtrees, so each edit keeps the input syntactically valid.",
    d: "The input is parsed into a tree using the grammar. Operators pick a node and replace it with a freshly generated subtree of the same kind, with a subtree from another corpus entry, or with a copy of a sibling. The tree is serialized and run. It keeps results valid while still crossing between corpus entries. It uses the grammar, the parser and the serializer. It is hard because the corpus must be stored as trees or reparsed, and parse-and-print loses malformed details of the original.",
    k: ["Tree edits versus byte edits: tree edits keep syntax valid and reach semantics, byte edits can produce malformed input that finds parser bugs.", "Subtrees from the same corpus versus freshly generated: corpus subtrees reuse known interesting pieces, generated ones add novelty."],
    p: ["Parse and re-serialize normalizes whitespace or encodings and removes the quirk that triggered the original crash.", "Type-compatible replacement still breaks cross-references such as names that must be defined before use."],
    v: "Mutate a corpus of valid documents with tree operators and confirm almost all results parse, and that new coverage per run exceeds byte-level mutation of the same corpus.",
    dep: ["grammar-definition", "input-serialization", "corpus-store"]
  },
  "typed-structure-fuzzing": {
    s: "Describes the input as a typed record, such as a message with fields and enumerations, so the fuzzer mutates fields instead of raw bytes.",
    d: "A schema defines messages with typed fields, nesting and repetition. The fuzzer mutates the in-memory structure, changing field values, adding or removing repeated elements and flipping optional fields, then serializes to the target's format or calls the code under test directly with the typed object. This is a good fit for protocols and APIs. It uses schemas and the serializer. It is hard because the schema must mirror the target, and because it cannot represent inputs the schema forbids.",
    k: ["Mutate the typed value versus the bytes: typed edits keep messages valid, while bytes can reach malformed-message bugs.", "A full schema versus a partial one: a full schema covers every field and takes effort, a partial one is quick and leaves fields at default."],
    p: ["A schema out of step with the target silently drops new fields from fuzzing.", "Serialization normalizes unusual values and never sends the form that breaks the target."],
    v: "Fuzz a message parser with the typed approach and confirm every field of the schema has taken multiple distinct values in the logs and coverage reaches handlers of each message type.",
    dep: ["input-serialization", "grammar-definition"]
  },
  "format-templates": {
    s: "A declarative description of a binary format's layout, with fields, sizes, offsets, checksums and dependencies, that guides generation and mutation.",
    d: "Templates describe a file as a sequence of typed fields with lengths, counts, enumerations and relations, such as a length field that equals a payload size or a checksum over a region. The fuzzer mutates fields and recomputes dependent fields. It captures what a grammar of characters cannot. It feeds mutators and the serializer. It is hard because real formats have conditional layout, padding, alignment and compression, which require more than a flat field list.",
    k: ["Recompute dependent fields versus leave them stale: recomputing keeps inputs valid and misses bugs that need inconsistent lengths, leaving them tests validation.", "Declarative templates versus code: templates are readable and limited, code handles any quirk and is harder to share."],
    p: ["Templates always fix lengths and checksums, so length-mismatch bugs are never exercised.", "Templates for one format version are used on another and fields shift."],
    v: "Generate files from the template, parse them with an independent reader, and confirm fields, counts and checksums are consistent, then mutate and confirm dependent fields are updated as declared.",
    dep: ["input-serialization"]
  },
  "constraint-aware-generation": {
    s: "Generates inputs that satisfy semantic constraints a grammar cannot express, such as names defined before use, types that match and checksums that agree.",
    d: "After or during generation, a constraint pass fixes up cross-references, picks identifiers from those already defined, matches types, computes derived fields and enforces limits. Some systems use a small solver or a rule engine; others use fix-up code per format. It sits between generation and serialization. It is hard because constraints are often only known by reading the target, and because too many guarantees produce only boring valid inputs that never test rejected paths.",
    k: ["Enforce constraints always versus sometimes: always gives deep valid inputs, sometimes violating them also tests error handling.", "Fix-up code versus a solver: code is fast and per-format, a solver generalizes and costs time per input."],
    p: ["Constraints encoded from the specification are stricter than the target, so permissive-parser bugs are never reached.", "Fix-up recomputes a value after mutation and erases the corrupt value that was the point."],
    v: "Generate programs or documents requiring cross-references and confirm the target accepts them past semantic analysis at a much higher rate than unconstrained generation, while a share still violate constraints on purpose.",
    dep: ["grammar-based-generation", "format-templates"]
  },
  "input-serialization": {
    s: "Turns a structured input, a tree, record or sequence of calls, back into the exact bytes or calls the target consumes.",
    d: "A serializer renders trees or typed records to the wire or file format, applying encoding, alignment, lengths and checksums. For API fuzzing it turns the structure into a sequence of calls. Fuzzers also need the reverse, parsing corpus bytes into the structure. It is used by every structure-aware component. It is hard because serializers are rarely bijective: normalization loses information, and any inconsistency between parse and print breaks corpus loading and reduction.",
    k: ["Lossless round trip versus normalizing serializer: lossless keeps every quirk, normalizing is simpler and drops malformed variants.", "Serialize to bytes versus call the target with the object: bytes test the parser too, direct calls are faster and skip the parsing layer."],
    p: ["The serializer cannot emit invalid encodings, so parser bugs in the target's decoding are never reached.", "A serializer change invalidates every stored corpus entry."],
    v: "Parse each corpus entry into its structure and serialize it back, and confirm the bytes equal the original for a defined share of entries and that the target gives identical coverage.",
    dep: ["format-templates"]
  },
  "entry-point-harness": {
    s: "The function or program the fuzzer calls with each input: it receives bytes, calls the code under test and returns, with no output or side effects.",
    d: "A harness is the glue between the fuzzer's loop and the library or program being tested. It parses the buffer into whatever the target takes, calls the entry point and releases what it allocated. A good harness is small, fast, deterministic and reaches much code. It depends on the target interface and state reset. It is the highest-leverage part of a campaign: a mistake in what it calls, validates or skips caps the bugs findable regardless of how good the fuzzer is.",
    k: ["Harness a narrow function versus a high-level API: narrow is fast and focused but may feed impossible inputs, high-level is realistic and slower.", "Fail on bad input versus return quietly: failing is a bug oracle if invalid input must be handled, returning quietly avoids false alarms."],
    p: ["The harness rejects short or malformed input before reaching the target, so the interesting code is never tested.", "Global state set by the harness leaks between runs and makes crashes depend on history."],
    v: "Run the harness against a seed and confirm coverage includes the target's main entry code, then break the target on purpose and confirm the harness reports it as a failure.",
    dep: ["fuzz-target-interface", "state-reset", "input-adapter"]
  },
  "fuzz-target-interface": {
    s: "The contract between a fuzzer and a harness: a function signature or process protocol for delivering one input and signaling completion.",
    d: "In the in-process form the target exports one function taking a buffer and its length, which the fuzzer calls in a loop. In the process form, the target reads input from a file or stream and exits. Contracts also say how initialization hooks run once, how the harness reports a soft failure and which return values are allowed. It is used by all fuzzers that support the harness. It is hard because the contract is small but strict: returning non-zero, calling exit or keeping hidden state breaks assumptions of the loop.",
    k: ["In-process function versus standalone program: functions are much faster and share fate with the fuzzer, programs are isolated and slower.", "A shared interface across fuzzers versus a fuzzer-specific one: shared harnesses move between tools, specific ones can use richer features."],
    p: ["The target calls exit on error, which ends the whole fuzzing process rather than one run.", "The harness's one-time setup runs on every input because the init hook is missing."],
    v: "Compile one harness and run it under two different fuzzers and the plain replay tool, and confirm identical behavior and coverage on the same input in each.",
    dep: ["entry-point-harness"]
  },
  "input-adapter": {
    s: "Code in the harness that turns the fuzzer's raw bytes into the arguments, files or messages the target actually takes.",
    d: "An adapter splits the buffer into parts, such as options plus data, writes bytes to a temporary file, wraps them in a stream, or builds a message object. It may reject buffers too short to be useful or cap sizes to avoid time-outs. It sits inside the harness in front of the entry call. It is hard because every choice biases the search: where it cuts the buffer decides which mutations are meaningful, and a length prefix or header consumed by the adapter makes later bytes shift.",
    k: ["Using the front of the buffer for options versus the back: front is simple but any insertion shifts all fields, back keeps data stable at the cost of clumsy parsing.", "Consume all bytes versus stop at a limit: consuming everything is simple, limits keep runs fast."],
    p: ["An adapter reads a variable-length header, so one inserted byte reshapes every later field.", "Bytes beyond the cap are ignored, wasting mutation effort on content that has no effect."],
    v: "Mutate single bytes at each offset and confirm each part of the buffer changes the target's behavior in the intended way, and that no large region is ignored.",
    dep: ["entry-point-harness", "data-provider"]
  },
  "data-provider": {
    s: "A helper that consumes fuzzer bytes as typed values, such as integers, strings, booleans and choices, so a harness can build structured calls from flat data.",
    d: "The provider wraps the buffer and offers methods that return the next integer in a range, a string of bounded length, a boolean, or one element from a list. When bytes run out it returns defaults. Harness code uses it to decide which functions to call and with what arguments. It sits in the harness. It is hard because the mapping from bytes to values decides mutation locality: consuming from both ends, or consuming variable lengths, makes single-byte edits change many decisions at once.",
    k: ["Consuming sequentially versus by fixed layout: sequential is easy to write, fixed layout keeps edits local.", "Defaults on exhaustion versus failing: defaults let short inputs run and make many inputs equivalent, failing wastes executions."],
    p: ["Range mapping by modulo skews value distribution and some values are far more likely than others.", "Reordering harness decisions silently changes the meaning of the whole stored corpus."],
    v: "Feed the provider a fixed buffer and confirm the same typed values come out each time, then change one byte and confirm only the expected value or choice changes.",
    dep: ["input-adapter"]
  },
  "stateful-harness": {
    s: "A harness that treats the input as a script of operations on one long-lived object or service, to find bugs that depend on call order and accumulated state.",
    d: "The input is decoded into a sequence of actions, such as create, update, query, close, each with arguments, run against one instance of the target. The harness tracks valid handles so that later calls refer to objects made earlier. It tests state machines, caches and resource lifetimes. It uses the data provider and state reset. It is hard because sequences are long and slow to run, coverage over them is a weak signal, and invalid sequences are common.",
    k: ["Valid-by-construction sequences versus arbitrary calls: valid ones go deep and miss misuse bugs, arbitrary calls test error handling and mostly fail early.", "Short sequences versus long: short ones run fast and repeat, long ones reach deep states and are slow to reduce."],
    p: ["Handles invalidated by earlier calls produce use-after-free in the harness itself, blamed on the target.", "Very long sequences make minimization so expensive that crashes never get reduced."],
    v: "Plant a bug that needs a particular three-call order, fuzz, and confirm it is found and the minimized input is that three-call sequence.",
    dep: ["data-provider", "state-reset", "api-sequence-fuzzing"]
  },
  "network-harness": {
    s: "A harness that delivers fuzzed bytes to a network service as if from a peer, either over real sockets or through a simulated transport.",
    d: "The simplest form replaces the socket layer with a function that feeds the input as if it arrived from a client, which avoids timing and system calls. Real-socket forms start the server, connect and send, then wait for a response or close. Replies may be fed back for protocols with multiple turns. It uses environment stubs and the process mode. It is hard because network targets add timeouts, threads, nondeterminism and port conflicts, and each of these lowers speed and reproducibility.",
    k: ["Simulated transport versus real sockets: simulation is fast and deterministic, and misses bugs in the real I/O path.", "Single message versus a whole session: single messages are quick and fine for parsers, sessions reach stateful logic and slow every run."],
    p: ["The server's own timers and threads make each run vary, and crashes cannot be reproduced.", "Parallel instances bind the same port and all but one fail to start."],
    v: "Replay a recorded crashing message through the network harness five times and confirm the same failure, then confirm the harness runs at the rate expected for the chosen transport.",
    dep: ["environment-stubs", "protocol-state-fuzzing", "deterministic-environment"]
  },
  "environment-stubs": {
    s: "Replacements for the target's dependencies on clocks, files, networks and randomness, so each run is fast, isolated and repeatable.",
    d: "Stubs substitute a fixed clock, in-memory filesystem, scripted network peer and seeded random source for the real ones, either at link time or by interposing library calls. They remove dependencies that make runs slow or nondeterministic and prevent the target from touching the host. They are used by harnesses and network harnesses. They are hard because a stub that is too simple hides real behavior, and one that is too faithful costs speed.",
    k: ["Stubbing at the library boundary versus the system call boundary: library stubs are fast and tied to one library, system call stubs cover everything and are heavier.", "Fixed values versus fuzzer-controlled values: fixed values stay deterministic, controlled values let the fuzzer vary the environment at a risk of nonreproducibility."],
    p: ["A stubbed clock never advances, so timeout and retry paths are never exercised.", "Stubs hide a dependency's error responses and the target's error handling goes untested."],
    v: "Run the target twice with stubs and confirm identical traces and coverage, then change a stubbed value and confirm the dependent behavior follows.",
    dep: ["deterministic-environment"]
  },
  "state-reset": {
    s: "The steps that return a target to a clean state between runs, so that a crash depends only on the current input and not on earlier ones.",
    d: "In persistent and in-process modes the same process serves thousands of inputs, so globals, caches, open handles and allocated memory carry over. The harness resets what it can by freeing objects, clearing caches and reinitializing state, and the fuzzer restarts the process periodically to clear leaks. It uses the persistent mode and leak detection. It is hard because some state, such as global caches and lazily initialized singletons, cannot be reset and silently changes behavior across runs.",
    k: ["Reset in the harness versus restart the process: resetting is fast and incomplete, restarting is complete and slow.", "Restart on a fixed interval versus on detection of drift: a fixed interval is simple, detection restarts only when needed and needs a reliable signal."],
    p: ["A cache filled by earlier inputs makes later inputs take different paths, and crashes do not reproduce alone.", "Memory leaks across runs lead to out-of-memory kills reported as target bugs."],
    v: "Run the same input at the start of a long session and after a million other inputs and confirm identical coverage and result.",
    dep: ["persistent-mode", "leak-detection"]
  },
  "fuzzing-build-config": {
    s: "The build settings that compile a target for fuzzing: instrumentation, sanitizers, optimization level, disabled checks and fuzzer-friendly code paths.",
    d: "A fuzzing build turns on coverage instrumentation and sanitizers, keeps optimization high enough for speed but low enough for readable traces, and defines a macro that lets the code relax obstacles such as checksums, random seeds and expensive error checks. Separate builds are kept for fuzzing, coverage reporting and reproduction. It is used by onboarding and the CI. It is hard because the fuzzing build differs from production, so a bug may exist in only one of them, and keeping several builds consistent over time is operational work.",
    k: ["Disable checksums and similar obstacles under a macro versus keep production code: disabling reaches deeper code, while keeping tests the real behavior and blocks mutation.", "Sanitizers on during fuzzing versus off: on finds silent bugs and costs speed, off is faster and sees only crashes."],
    p: ["A fuzzing-only macro hides a bug that exists only in the production configuration.", "Build flags drift between the fuzzing and coverage builds, and edge identities no longer match."],
    v: "Build the target in the fuzzing configuration, run it on a known bug-triggering input, and confirm the expected sanitizer report appears and the coverage map is nonempty.",
    dep: ["compile-time-instrumentation", "memory-error-sanitizers"]
  },
});
