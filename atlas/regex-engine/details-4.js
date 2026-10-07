// Details for the regular expression engine plate, part 4: NFA simulation, backtracking, Unicode.
ATLAS.details("regex-engine", {
  "nfa-thread-simulation": {
    s: "Runs the NFA by keeping every currently live state together and stepping them all on each input byte, tracking captures per thread, with time linear in the input.",
    d: "Each live state is a thread carrying its own capture slots. For each byte the engine advances every thread, follows empty transitions to add new threads, and drops duplicates so the thread count never exceeds the number of states. Threads are kept in priority order so the first to reach the match state wins under leftmost-first rules. Time is input length times state count; memory is bounded. It supports captures and assertions but not backreferences. The hard part is its constant factor, much slower than a DFA.",
    k: ["Simulation with per-thread captures versus DFA plus rerun: simulation gives captures in one pass, while the DFA is faster but needs a second pass for captures.", "Dropping duplicate states by priority versus keeping them all: dropping bounds memory and time, and is valid because a lower-priority thread can never win."],
    p: ["Copying all capture slots at every step for a pattern with many groups, making the simulation many times slower.", "Misordering threads so a lower-priority alternative wins."],
    v: "Run the simulation on pathological patterns and inputs and confirm the live thread count never exceeds the state count and total time grows linearly when input doubles.",
    dep: ["thompson-construction", "sparse-state-set", "capture-slot-copying", "priority-ordering"]
  },
  "sparse-state-set": {
    s: "A set structure over state numbers that supports constant-time insert, membership test and clear, and iterates in insertion order.",
    d: "It stores a dense array of members in insertion order and a sparse array mapping each state number to its position in the dense array. Membership checks the sparse entry then confirms it points to a matching dense entry, which avoids needing zeroed memory. Clearing resets only a length counter. Insertion order is preserved, which keeps thread priority. It fits the simulation and DFA construction inner loops. The hard part is that sizing it to the number of states ties its memory to program size, per thread.",
    k: ["Sparse set versus bitset plus list: the sparse set clears in constant time and keeps order, while a bitset is smaller but clears in time proportional to its size.", "Uninitialized sparse array versus zeroing: skipping zeroing saves startup cost, but needs the validity check on every lookup."],
    p: ["Reading uninitialized memory as valid without the dense-array cross check, yielding phantom members.", "One set per thread per pattern, multiplying memory in large services."],
    v: "Insert, test and clear sets of random states for a million operations and compare against a reference set, confirming order is insertion order and clear time does not grow with set size.",
    dep: ["arena-allocation"]
  },
  "capture-slot-copying": {
    s: "The mechanism by which each simulated thread carries its own copy of capture positions, copied on fork and updated on group entry and exit.",
    d: "When a split creates a second thread, the new thread needs its own slot array. Naive copying costs time proportional to slot count at every fork. Better designs share slots and copy on write, or keep slots in a table indexed by thread and only copy changed entries. Slots are filled by save instructions as the thread passes group boundaries. When a thread reaches match, its slots become the result. The hard part is keeping this cheap when patterns have many groups.",
    k: ["Copy on fork versus copy on write: copying is simple, while copy on write saves work when threads share most slots but needs reference management.", "Tracking all groups versus only requested ones: requested-only cuts cost, but requires a program compiled with fewer slots."],
    p: ["Aliased slot arrays where updating one thread's capture overwrites another's.", "Copy cost scaling with group count times thread count on every byte."],
    v: "Run patterns with many groups through the simulation and confirm captures equal the reference result, then profile and confirm copy time does not dominate when only the overall span is requested.",
    dep: ["capture-slot-allocation", "nfa-thread-simulation"]
  },
  "priority-ordering": {
    s: "Keeps simulated threads in the order a backtracker would try them, so the first thread to match is the same match a backtracking engine returns.",
    d: "At each split, the preferred branch's thread is added before the other. Following empty transitions explores threads depth first in that order, and stepping to the next byte preserves the relative order. When a thread reaches the match state, all lower-priority threads are cut off, since they cannot beat it, while higher-priority ones continue because they might produce a preferred longer match. This reproduces greedy and lazy behavior exactly. The hard part is the empty-loop rule, where a repeat that consumes nothing must be cut off consistently.",
    k: ["Strict priority order versus unordered thread sets: ordered gives backtracker-compatible results and early cutoff, while unordered is simpler but returns longest or arbitrary matches.", "Cutting off lower-priority threads on match versus keeping all: cutting shortens work, and is required for correct leftmost-first results."],
    p: ["Adding threads in the wrong order at a lazy repeat so lazy behaves greedy.", "Not cutting lower-priority threads after a match, returning a later alternative's match."],
    v: "Run greedy, lazy and alternation patterns against inputs where the preference matters and confirm the span equals the backtracking engine's span in every case.",
    dep: ["nfa-thread-simulation", "thompson-construction", "match-semantics-modes"]
  },
  "one-pass-matcher": {
    s: "A fast captures engine for patterns where, at each byte, only one transition can ever be taken, so no threads or backtracking are needed.",
    d: "If the automaton is one-pass, each state and byte lead to a single next state, so capture slots can be updated in place with a table lookup, as in a DFA. The compiler checks whether the pattern has this property, which holds for many ordinary patterns such as fields separated by delimiters. When it applies, captures cost a single pass at close to DFA speed. The hard part is the analysis: it must be exact, since claiming one-pass for an ambiguous pattern gives wrong captures, and it only works anchored.",
    k: ["Dedicated one-pass table versus general simulation: one-pass is several times faster, while building it costs memory and only applies to unambiguous patterns.", "Requiring anchoring versus supporting unanchored search: anchored makes the single path property hold, while unanchored searches need other engines."],
    p: ["Declaring a pattern one-pass when two paths exist for some byte, yielding wrong captures.", "Spending memory on a one-pass table for patterns searched only once."],
    v: "Check the one-pass analysis against a brute-force ambiguity test on a pattern set and confirm results equal the thread simulation on each pattern the analysis accepts.",
    dep: ["thompson-construction", "capture-slot-allocation", "engine-selector"]
  },
  "bounded-backtracker": {
    s: "A backtracking matcher that records visited state and position pairs in a bitmap so no pair is explored twice, giving linear time for small patterns and inputs.",
    d: "It runs depth-first like a backtracker but keeps a bitmap with one bit per state and byte position. If a pair was already visited, the branch fails immediately, because it failed before. Time and memory are bounded by states times input length, so it is only used when that product is small, typically a few hundred kilobytes. It supports captures and is faster than thread simulation on small inputs. The hard part is the memory bound: large inputs must go to another engine.",
    k: ["Visited bitmap versus plain backtracking: the bitmap removes exponential behavior, while costing memory proportional to program times input.", "Using it for captures on small spans versus the simulation: faster on small cases, with a size threshold that moves the work elsewhere when exceeded."],
    p: ["Running it on a long haystack where the bitmap would allocate hundreds of megabytes.", "Forgetting to clear the bitmap between searches and reporting stale failures."],
    v: "Run a catastrophic pattern on input of a few hundred bytes and confirm linear time and bitmap size equal states times length, then confirm a larger input is routed to another engine.",
    dep: ["backtracking-matcher", "visited-bitset", "program-instructions", "capture-slot-allocation"]
  },

  "backtracking-matcher": {
    s: "Matches by trying alternatives in priority order, descending into each and returning to the last choice point on failure, supporting every pattern feature.",
    d: "The matcher walks the program, and at each split pushes the alternative onto a stack and follows the preferred branch. On failure it pops the stack and resumes. Captures are saved and restored via the stack. Because it follows one path at a time, it needs little memory and handles backreferences, lookaround and atomic groups. Its cost is the number of paths explored, which can be exponential for patterns with ambiguous nesting. The hard part is defending against that without removing the features that need it.",
    k: ["Full backtracking versus automata: backtracking supports every feature and starts fast, while automata guarantee linear time but cannot express some constructs.", "Recursive implementation versus explicit stack: recursion is simple, while an explicit stack avoids native stack overflow and allows limits."],
    p: ["A nested unbounded repeat over overlapping alternatives takes exponential time on a near-match, hanging the process.", "Native stack exhaustion on long inputs for a recursive implementation."],
    v: "Run typical patterns on realistic text and confirm throughput comparable to automata. Run a catastrophic pattern and confirm the step budget stops it.",
    dep: ["program-instructions", "backtrack-stack", "recursion-limit", "greedy-lazy-quantifiers", "capture-slot-allocation"]
  },
  "backtrack-stack": {
    s: "The explicit stack that holds pending alternatives, saved capture values and loop counters so the matcher can return to a choice point and undo changes.",
    d: "Each entry records a program counter and input position to resume at, or an undo record restoring a capture slot or counter. Entries are pushed at splits and capture saves and popped on failure. The stack is a growable array with a maximum size, which bounds memory for hostile inputs. Atomic groups and lookaround discard entries back to a mark. The hard part is size: a loop over a long input pushes one entry per iteration, so memory scales with input unless the engine optimizes simple loops.",
    k: ["A growable heap stack versus the native call stack: heap stack can be limited and reported, while native recursion is faster to write but crashes on overflow.", "Pushing undo records versus snapshotting capture arrays: undo records are small, while snapshots are simple but copy a lot."],
    p: ["A repeat over a million characters pushing millions of entries and exhausting memory.", "Failing to pop an undo record on an atomic group cut, leaving stale captures."],
    v: "Match a repeat over a one-million-byte input and confirm stack growth is bounded by the configured limit, with a clean error at the limit and correct results below it.",
    dep: ["backtracking-matcher", "memory-accounting"]
  },
  "visited-bitset": {
    s: "Memoization table recording which state and position pairs have already failed, so a backtracker never repeats failed work and runs in linear time.",
    d: "Before exploring a state at a position, the matcher checks a bit; if set, it fails at once. The bit is set on entry because by the time the matcher returns to this pair it must have failed. This removes the exponential blowup for patterns without backreferences. Memory is states times positions bits, so the table is allocated lazily or only for small inputs, or limited to part of the pattern. It cannot be used when match behavior depends on more than state and position, as with backreferences.",
    k: ["Memoizing all pairs versus only at loop entries: all pairs are simple but large, while loop entries need less memory and fix most exponential cases.", "Enabling by pattern analysis versus after a step threshold: analysis is predictable, while the threshold only pays the cost when a search turns out to be slow."],
    p: ["Memoizing in a pattern with backreferences, where the same state and position can succeed or fail depending on captures.", "A table sized by the haystack for a very large input."],
    v: "Run an exponential pattern with and without memoization on the same input and confirm step counts drop from exponential to bounded by states times length, with identical results.",
    dep: ["backtracking-matcher", "memory-accounting"]
  },
  "greedy-lazy-quantifiers": {
    s: "Greedy repeats try to take as much as possible before backing off; lazy repeats take as little as possible before extending.",
    d: "A greedy loop pushes the exit alternative onto the stack and then takes another iteration, so on failure it backs off one iteration at a time. A lazy loop reverses the order. The choice changes which of several valid matches is found and how much work failure takes. Simple loops over single characters are optimized to scan forward and then back off without pushing an entry per iteration. The hard part is empty iterations, where a loop body that can match nothing must stop looping to avoid infinite cycles.",
    k: ["Per-iteration stack entries versus a loop optimization that stores one range: the range version saves large amounts of memory, but only applies to single-width bodies.", "Stopping empty iterations versus allowing them: stopping prevents infinite loops, but must agree with other engines on the resulting captures."],
    p: ["An empty-matching loop body without an iteration progress check, which never terminates.", "Greedy over a class followed by a literal causing quadratic backing off on long lines."],
    v: "Match greedy and lazy versions of the same pattern on text where both succeed and confirm the spans differ as defined. Test an empty-matching loop body and confirm termination.",
    dep: ["backtracking-matcher", "backtrack-stack", "priority-ordering"]
  },
  "atomic-and-possessive": {
    s: "Constructs that commit to a match and forbid backing into it, used to prevent runaway backtracking and to express exact parsing choices.",
    d: "An atomic group matches its contents as a unit: once it succeeds, the matcher discards its internal choice points, so later failure cannot retry other ways to match the group. A possessive quantifier is a repeat followed by that cut. They cannot be expressed in plain automata without changing semantics, so patterns using them go to the backtracker. Used well they cut worst-case time for a known ambiguous region. The hard part is that they change the language matched, so adding one can turn a matching pattern into a non-matching one.",
    k: ["Offering cut constructs versus omitting them: they give authors control over performance, but are unsupported in automata engines and not part of every dialect.", "Rewriting into atomic form automatically versus leaving the pattern as written: automatic rewrites speed safe cases, but must prove semantics are unchanged."],
    p: ["Assuming a possessive repeat only affects speed, then losing a match that needed backing off.", "Cutting choice points but leaving capture undo entries above the mark."],
    v: "Match a pattern that succeeds with a plain repeat and fails with the possessive form, confirm the failure, and confirm backtracking steps drop on a hostile input.",
    dep: ["backtracking-matcher", "backtrack-stack", "feature-detection"]
  },
  "backreference-matching": {
    s: "Matches text identical to what an earlier group captured, which no finite automaton can express and so requires backtracking.",
    d: "The matcher reads the group's saved span and compares the current input to it, optionally case-insensitively. If the group did not participate, the reference fails or matches empty depending on dialect. Because a match now depends on earlier captured text, the visited-state memoization is invalid, and the problem is NP-hard in general. Patterns using backreferences therefore carry the full backtracking risk and are the main reason engines drop the linear-time guarantee. The hard part is bounding cost.",
    k: ["Supporting backreferences versus dropping them for a linear guarantee: support matches users' patterns, while dropping makes the engine safe and automaton-based.", "Case-insensitive comparison by folding at match time versus compile time: match time handles any captured text, while compile time cannot know it."],
    p: ["A backreference to a group that has not yet matched or lies in a different branch, with dialect-specific results.", "Combining backreferences with nested repeats on untrusted input."],
    v: "Match repeated-word patterns on text and confirm correct spans, including a reference to an unset group per the dialect. Run a hostile pattern and confirm the budget stops it.",
    dep: ["backtracking-matcher", "capture-slot-allocation", "case-folding", "step-counters"]
  },
  "lookaround-execution": {
    s: "Runs lookahead and lookbehind subpatterns during backtracking, checking text around the position without consuming it and without leaking its captures when negated.",
    d: "On reaching a lookaround, the matcher saves its position and stack mark, runs the nested program, then restores the position. A positive lookaround keeps captures made inside it and discards its choice points, since lookaround is atomic. A negative lookaround succeeds if the nested program fails and never keeps captures. Lookbehind runs the nested program ending at the position, either by trying start positions in a bounded range or by matching a reversed program. The hard part is lookbehind with variable length.",
    k: ["Fixed-length lookbehind only versus variable length: fixed is simple and fast, while variable lengths are more expressive and need multiple tries or a reverse match.", "Atomic lookaround versus allowing backtracking into it: atomic is the standard and cheaper, while backtracking into it is rarely wanted and complex."],
    p: ["Lookbehind that scans back to the start of the text at each position, giving quadratic time.", "Captures from a positive lookahead being undone by a later failure incorrectly, or kept after a negative one."],
    v: "Match password-style patterns using several lookaheads and a lookbehind on test strings and confirm results equal the reference at every start position, including near the beginning of the text.",
    dep: ["backtracking-matcher", "lookaround-compilation", "backtrack-stack"]
  },
  "recursion-limit": {
    s: "A cap on backtracking depth or total steps so the matcher stops with an error instead of overflowing the stack or running for hours.",
    d: "The limit is counted in nested calls, stack entries or total steps, and exceeding it aborts the search with a specific error. Different limits protect different resources: depth protects memory and the native stack, total steps protect time. Defaults trade being generous for legitimate patterns with safety. Callers can raise or lower them. The hard part is surfacing the result: a limit hit is not a no-match, and callers who treat it as one make wrong decisions about security checks and validation.",
    k: ["A step limit versus a depth limit: steps bound time on any pattern, while depth bounds memory on long repeats; most engines need both.", "Error on limit versus silent no-match: an error is honest, while silent failure is easy to miss and unsafe."],
    p: ["Treating a limit error as no match in a validation or filter, which can let hostile input through.", "A limit set high enough that the search is already harmful when it triggers."],
    v: "Run a hostile pattern and input and confirm the limit error is raised within the expected step count, and that the API distinguishes it from no match.",
    dep: ["step-counters", "backtrack-stack", "error-reporting"]
  },

  "utf8-decoding": {
    s: "Decodes bytes into code points, validating sequences and locating character boundaries so matches never start or end inside a character.",
    d: "A decoder reads one to four bytes per code point and rejects invalid sequences: overlong forms, surrogate code points, values beyond the maximum and truncated endings. Matching in byte automata embeds the same validity rules in the compiled automaton, so the decoder is needed for the backtracker, boundary checks and reporting. Searching backward needs a reverse decoder. The hard part is performance on mostly ASCII text, which needs a fast path, and consistent handling of invalid bytes across engines.",
    k: ["Strict validation versus lenient decoding with replacement: strict is safe and predictable, while lenient is robust on dirty data but can hide problems.", "Decoding once up front versus decoding on demand: up front is simple but costs memory, while on demand streams but repeats work on backtracking."],
    p: ["Accepting overlong encodings that bypass a filter written for the shortest form.", "Reading a partial sequence at the end of a chunk as invalid."],
    v: "Decode the standard set of valid and invalid sequences, including overlong and surrogate forms and truncated tails, and confirm accept and reject results and boundaries equal the specification.",
    dep: ["invalid-bytes-policy"]
  },
  "unicode-property-tables": {
    s: "Generated tables that map code points to properties such as category, script, case and word class, stored compactly for fast lookup and class construction.",
    d: "Tables come from the Unicode data files and are processed at build time into sorted range lists or multi-stage lookup arrays. The class parser queries ranges for a named property; the matchers use stage tables to classify a code point quickly. Each Unicode release changes the data, so the version is recorded. Tables are large, so they are stored compactly and linked only when needed. The hard part is size: full Unicode support adds hundreds of kilobytes to a binary.",
    k: ["Range lists versus multi-stage lookup tables: ranges are compact and ideal for compiling classes, while stage tables give constant-time classification at runtime.", "Embedding all properties versus a subset: all gives complete support, while a subset shrinks the binary but fails for rarely used property names."],
    p: ["Mixing tables from different Unicode versions between case folding and categories.", "Using unassigned code points as if they have no property when later versions assign them."],
    v: "Compare table lookups for every code point against the published data file for the pinned version, confirming zero differences for category, script and case properties.",
    dep: ["table-generation"]
  },
  "general-category-and-script": {
    s: "Class syntax for matching characters by general category such as letter or digit and by script, translated into code point range sets.",
    d: "A pattern names a property, and the parser resolves it, with aliases and case-insensitive names, to a range set from the tables. Script extensions allow a character to belong to several scripts. Negated forms complement the set. Compound classes combine properties with set operations. The compiler turns the resulting set into byte automata, where large sets like all letters need careful sharing to stay small. The hard part is unknown or newly added names, and the difference between script and script extensions.",
    k: ["Resolving property names at parse time versus lazily: parse time reports unknown names immediately, while lazy avoids loading tables for patterns that never use them.", "Script versus script extensions: script is simpler and stable, while extensions match how characters are used across languages."],
    p: ["A misspelled property name silently treated as a literal or empty class.", "Assuming a letter class is limited to ASCII letters on international text."],
    v: "Match letter, digit and script classes against sample text in multiple scripts and confirm each character is classified as the published data states, with an unknown name rejected at compile time.",
    dep: ["unicode-property-tables", "class-set-algebra", "character-class-parser"]
  },
  "case-folding": {
    s: "The mapping data and rules that decide which characters count as the same under case-insensitive matching, including special and multi-character cases.",
    d: "Simple case folding maps each character to one folded form, producing equivalence classes of characters that match each other. Full folding maps some characters to several, such as a German sharp s to two letters, which breaks the one-character, one-step model. Locale-dependent rules, such as the dotted and dotless I in Turkic languages, are normally excluded. The tables feed the case-fold rewrite. The hard part is deciding the level of support and documenting where it deviates from user expectations.",
    k: ["Simple folding versus full folding: simple keeps the automaton's character-per-step model, while full matches more text but requires multi-character handling.", "Locale-neutral folding versus locale-aware: neutral is deterministic and cacheable, while locale-aware is correct for some users but makes pattern meaning environment-dependent."],
    p: ["Using a lowercase-and-compare shortcut that mishandles characters with several case forms.", "Assuming folding is an equivalence class of size two and missing characters with three variants."],
    v: "For every character in the table, confirm a case-insensitive match against each member of its equivalence class and rejection of non-members, comparing against the published folding data.",
    dep: ["unicode-property-tables", "table-generation"]
  },
  "word-boundary-semantics": {
    s: "Defines which characters count as word characters and how word boundary assertions are decided, in ASCII mode or with full Unicode word rules.",
    d: "The common definition says a boundary lies between a word character and a non-word character or text edge. In ASCII mode word characters are letters, digits and underscore only; in Unicode mode they include letters and digits of all scripts. The check needs the previous and next characters, so DFAs encode it with context in states, and Unicode mode needs multi-byte lookups. Some engines also offer segmentation-based boundaries that follow Unicode word-break rules. The hard part is Unicode word class cost in the DFA.",
    k: ["ASCII word boundary versus Unicode: ASCII is fast and DFA friendly, while Unicode matches user text but expands automata and needs decoding.", "Simple word characters versus full word segmentation rules: simple is a regular assertion, while segmentation rules need more context and are not regular."],
    p: ["ASCII boundary on non-English text, so every accented word breaks in the wrong place.", "Evaluating the boundary at a chunk edge without the previous character."],
    v: "Test boundary positions in text with accented, non-Latin and digit words in ASCII and Unicode mode and confirm the match positions equal a hand-computed table.",
    dep: ["unicode-property-tables", "empty-assertion-compilation", "utf8-decoding"]
  },
  "ascii-fast-mode": {
    s: "An optimized path used when the pattern and input are pure ASCII, avoiding multi-byte automata, property lookups and decoding.",
    d: "If the pattern uses only ASCII constructs and Unicode mode is disabled, classes are 128-entry or byte tables and the dot is any byte except newline. Even in Unicode mode a pattern with only ASCII literals can use fast scans, since UTF-8 never encodes an ASCII byte inside a multi-byte sequence. Case-insensitive ASCII is a bit trick. Speed gains are large for the common case. The hard part is knowing safely that input is valid ASCII when it is not guaranteed.",
    k: ["Separate ASCII automaton versus the general one: separate is faster and smaller, while the general automaton avoids a second compile path.", "Checking input for ASCII before using the path versus assuming: checking costs a scan, while assuming risks wrong results on non-ASCII bytes."],
    p: ["Using ASCII class tables on input that contains multi-byte characters and matching individual bytes.", "Applying ASCII case-insensitivity in Unicode mode, missing non-ASCII pairs."],
    v: "Run an ASCII-only pattern on ASCII and mixed text, in both modes, and confirm results equal the general engine, with throughput on ASCII input measurably higher.",
    dep: ["utf8-decoding", "option-flags", "engine-selector"]
  },
  "invalid-bytes-policy": {
    s: "The rule for what the engine does when input is not valid text: reject, replace, treat as raw bytes, or let patterns match bytes directly.",
    d: "A text-oriented engine can require valid UTF-8 and error on anything else. A byte-oriented mode lets patterns match arbitrary bytes, and a pattern may include non-UTF-8 byte escapes. In between, invalid bytes may be treated as never matching a class, or as a replacement character. The policy shows in API types, since text and bytes are separate entry points. The hard part is consistency: the same pattern on the same bytes must behave the same in every engine and in streaming.",
    k: ["Separate text and bytes APIs versus one API: separate makes the policy explicit in types, while one is simpler but leaves invalid input behavior to documentation.", "Error on invalid input versus treating it as non-matching: errors are safe for validation, while lenient handling suits log scanning."],
    p: ["A dot that matches an invalid byte in one engine and not in another.", "Silently skipping invalid input in a security filter, which attackers use to hide payloads."],
    v: "Search inputs containing stray continuation bytes and truncated sequences with each engine and API entry, and confirm identical, documented behavior across all of them.",
    dep: ["utf8-decoding", "unicode-policy"]
  },
  "grapheme-and-normalization": {
    s: "Optional handling for user-perceived characters made of several code points, and for text that is canonically equivalent but encoded differently.",
    d: "A dot matches one code point, not a visible character, so an accented letter written as base plus combining mark counts as two. Some engines offer a grapheme cluster mode or class. Normalization forms make different encodings of the same text compare equal, but regex engines usually do not normalize, leaving callers to do so before matching. Supporting clusters needs segmentation rules that are not regular and need lookup tables. The hard part is that users assume matching works on visible characters.",
    k: ["Code point semantics versus grapheme clusters: code points are simple and fast, while clusters match visual units but need extra tables and context.", "Normalizing input before matching versus in the engine: callers can choose a form and pay once, while in-engine normalization is convenient but changes offsets."],
    p: ["A pattern for one accented letter failing on text in decomposed form.", "Reporting offsets that fall inside a visible character and splitting it when sliced."],
    v: "Match a single-character pattern against composed and decomposed forms of the same letter and confirm the documented behavior, and that match offsets never split a cluster in cluster mode.",
    dep: ["unicode-property-tables", "utf8-decoding"]
  }
});
