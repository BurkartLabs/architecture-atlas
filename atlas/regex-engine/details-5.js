// Details for the regular expression engine plate, part 5: input model and foundation.
ATLAS.details("regex-engine", {
  "haystack-abstraction": {
    s: "The view of input that matchers read: a contiguous byte slice, with optional extensions for text split across buffers or produced lazily.",
    d: "The simplest form is one contiguous byte slice, which lets vector scans and DFAs run flat out. Rope-like or chunked inputs, such as editor buffers, need an interface that returns the next contiguous piece, and matchers must handle matches crossing piece boundaries. The abstraction also supplies context bytes before and after the window for assertions. Keeping the hot path on a plain slice and adapting other sources by copying or chunking preserves speed. The hard part is not slowing the common case.",
    k: ["Contiguous slice only versus a general input trait: slice-only gives full speed and simple code, while a trait supports editor buffers directly at a cost in every inner loop.", "Copying non-contiguous text first versus matching in place: copying is simple but costs memory and time, while in-place needs boundary logic."],
    p: ["Matchers assuming contiguity and missing matches across rope segment boundaries.", "Copying a multi-gigabyte buffer for a one-off search."],
    v: "Search a text stored as many small segments and confirm results equal a search of the concatenated text, including matches across every segment boundary.",
    dep: ["span-and-offset-types", "chunked-input"]
  },
  "search-window": {
    s: "The range of the haystack in which a match must lie, together with the surrounding text that assertions may look at.",
    d: "A search gets a start and end offset. A match must lie inside, but anchors, boundaries and lookaround may inspect bytes outside, so the full haystack stays visible. The window also carries anchoring mode: unanchored, anchored at start, or anchored at both ends. Iteration and replacement move the window start while keeping the haystack, which is what makes consecutive searches consistent with one search over the whole text. The hard part is the difference between text start and window start, which bugs confuse.",
    k: ["Window with visible context versus slicing the haystack: context gives correct assertion results, while slicing is simple but changes what anchors mean.", "Anchoring as a per-search option versus in the pattern: an option lets one compiled pattern serve both uses, while a pattern anchor is fixed."],
    p: ["Treating the window start as the start of text, so a start-of-text anchor matches mid-input.", "Letting lookbehind see only the window, so it fails near the window start."],
    v: "Search from each offset of a string with an anchored-at-start pattern and a boundary pattern, and confirm results equal slicing-free semantics from the specification at every offset.",
    dep: ["haystack-abstraction", "span-and-offset-types"]
  },
  "line-mode-semantics": {
    s: "How multiline and dotall flags change what line anchors and the dot match, including which characters count as line terminators.",
    d: "Without multiline, the line anchors match only at text start and end; with it, they match after and before line terminators. Dotall lets the dot match terminators too. The set of terminators differs by dialect: only the newline byte, or also carriage return and Unicode line and paragraph separators. A carriage return followed by newline may be one terminator. Terminators affect byte classes in the DFA and the reverse scan. The hard part is Windows line endings, where a line end anchor can match between the two characters.",
    k: ["Newline-only terminators versus the full Unicode set: newline-only is fast and simple, while the full set matches broader text conventions but complicates automata.", "Treating carriage return plus newline as one unit versus two characters: one unit is natural for users, while two is simpler but lets anchors match between them."],
    p: ["A line-end anchor matching between a carriage return and the following newline.", "Dotall left off by default so patterns fail across line breaks unexpectedly."],
    v: "Match line anchors and the dot on text with each terminator type under each flag combination and confirm positions equal a table, including the carriage return and newline pair.",
    dep: ["option-flags", "empty-assertion-compilation", "byte-equivalence-classes"]
  },
  "chunked-input": {
    s: "Feeding the engine input in pieces, with state carried between them, so large files and network streams can be searched without being fully in memory.",
    d: "Automata engines resume from saved state at the start of the next chunk. Match start positions require remembering the earliest candidate across chunks, which can force buffering of the pending region. Assertions need the last byte of the previous chunk. Absolute offsets are tracked by a running total. For engines that need random access, a bounded window of recent text is retained. The hard part is limiting buffering for patterns with unbounded match length.",
    k: ["Resumable DFA state versus buffering windows of text: state is compact, while windows support captures and lookaround but need a bound.", "Fixed chunk size versus adaptive: fixed is simple and predictable, while adaptive tunes throughput but varies behavior."],
    p: ["Dropping the last byte of context between chunks and misjudging a boundary.", "A match whose start lies in a chunk already released, so its text cannot be returned."],
    v: "Search a large file in chunks of several sizes, including one byte, and confirm the matches and offsets equal a single whole-input search, with memory staying within the configured window.",
    dep: ["haystack-abstraction", "dfa-start-states", "span-and-offset-types"]
  },
  "span-and-offset-types": {
    s: "The types that represent match positions, ensuring offsets are byte indices on character boundaries and ranges are well formed.",
    d: "A span has a start and end offset into the haystack, and the end is exclusive. Offsets are byte positions, which are cheap, and all slicing uses them. In text mode they must lie on code point boundaries; the engine guarantees this for matches it returns. Bindings translate offsets to the host's unit. Typed wrappers prevent mixing byte and character offsets, and checked arithmetic prevents overflow on huge inputs. The hard part is host mismatch and keeping offsets valid when the haystack is a chunk.",
    k: ["Byte offsets versus character offsets: bytes are constant time and exact, while character offsets need a scan or index and differ by encoding.", "Exclusive end versus inclusive: exclusive makes empty matches representable and slicing direct."],
    p: ["Returning offsets relative to a chunk rather than the whole stream.", "Using a 32-bit offset for a haystack larger than four gigabytes."],
    v: "Search texts with multi-byte characters and confirm every returned span slices to valid text equal to the match, including empty matches, and offsets on a five gigabyte input do not wrap.",
    dep: ["utf8-decoding"]
  },
  "empty-match-advance": {
    s: "The rule for continuing an iteration after a match that consumed nothing, so the search moves forward one character and never repeats the same position.",
    d: "After an empty match at position p, the next search must start somewhere that cannot produce the same match again. The standard rule advances by one character, not one byte, and also forbids an empty match at the end of the previous nonempty match in some dialects. Replace and split must follow the same rule. The hard part is that dialects differ on whether an empty match is allowed immediately after a nonempty one, which changes counts for patterns like an optional repeat.",
    k: ["Allowing an empty match right after a nonempty match versus forbidding: allowing finds more matches, while forbidding follows older conventions and avoids surprises.", "Advancing by code point versus byte: code point keeps spans valid, while byte is simpler but can start inside a character."],
    p: ["Advancing by one byte and reporting empty matches inside multi-byte characters.", "Different rules in iteration and replace, giving a different count of replacements than matches."],
    v: "Iterate and replace with an optional-repeat pattern on text such as a short word plus spaces, and confirm match counts and replacement output equal the dialect's reference results.",
    dep: ["span-and-offset-types", "utf8-decoding"]
  },

  "arena-allocation": {
    s: "Allocates the many small objects of parsing and compilation from large blocks released all at once, avoiding per-node allocation and cleanup.",
    d: "Trees, program fragments and temporary sets are created in bulk and die together after compilation. An arena hands out memory by bumping a pointer within a block and frees everything at once. This lowers allocation cost, improves locality and eliminates deep recursive destructors. Long-lived results such as the final program are copied into compact exact-size storage. The hard part is peak memory, since arenas hold everything until the end of compilation, and accounting must include the arena blocks.",
    k: ["Arena allocation versus general-purpose allocation per object: arenas are faster and simpler to free, while general allocation can release memory early.", "Copying results out of the arena versus keeping the arena alive: copying shrinks long-lived memory, while keeping avoids copy cost but wastes space."],
    p: ["Holding references into an arena after it was freed.", "Arena growth during compilation of a hostile pattern bypassing the size limit."],
    v: "Compile a large pattern and confirm that after compile the only retained memory is the final program, with the arena fully released and peak usage reported by the accounting equal to measured peak.",
    dep: ["memory-accounting"]
  },
  "memory-accounting": {
    s: "Tracks bytes used by parsing, compilation and caches against configured limits, so the engine can refuse work before exhausting memory.",
    d: "Each allocation site reports its size to a counter, and the counter is checked against limits for program size, cache size and per-search scratch. The engine accounts for logical structures, such as states and slots, rather than hooking the allocator, so limits are deterministic across platforms. Reports expose current usage for monitoring. The hard part is completeness: any structure that is missed is an unbounded allocation, and accounting overhead must stay off hot loops.",
    k: ["Counting logical structures versus intercepting the allocator: logical counting is portable and deterministic, while intercepting catches everything but ties the engine to allocator details.", "Per-object limits versus a shared budget: per-object are simple, while a shared budget bounds total usage across pattern and search."],
    p: ["A new data structure added without accounting, which silently reintroduces unbounded growth.", "Accounting counting capacity but the limit written in terms of used bytes, so growth strategy exceeds the cap."],
    v: "Compile and search with a memory cap and confirm measured peak resident memory from the process stays below the cap plus a documented fixed overhead, and that every limit error names the structure.",
    dep: []
  },
  "thread-sharing": {
    s: "Makes compiled patterns safe to share across threads without locks by keeping them immutable and putting mutable state in separate scratch objects.",
    d: "A compiled pattern is a read-only structure shared by reference counting. All mutable data, such as caches and state sets, lives in scratch objects handed to one search at a time. The shared object contains only lazily initialized parts guarded by one-time initialization, for example reverse programs. Because compiled data is read-only, cores share it in cache without invalidation traffic. The hard part is any hidden mutation, such as lazy caches inside the pattern, which would add locks to the hot path.",
    k: ["Immutable pattern plus separate scratch versus an internal mutex-guarded cache: immutable scales across cores, while an internal cache is convenient but serializes searches.", "Reference counting versus borrowed lifetimes: counting allows free sharing and passing between threads, while borrowing avoids atomic operations."],
    p: ["A lazily built DFA cache stored in the shared pattern and guarded by a lock, serializing every thread on a hot pattern.", "False sharing between scratch objects placed next to each other in memory."],
    v: "Run the same pattern from sixty-four threads on a many-core machine and confirm throughput scales near linearly with threads, with no lock acquisitions on the search path in a profile.",
    dep: ["scratch-cache-pool", "compile-api"]
  },
  "vector-dispatch": {
    s: "Detects CPU vector capabilities at startup and selects the fastest implementations of the scan routines, with a portable fallback.",
    d: "Scan routines exist in several variants for different register widths, and the runtime checks CPU feature flags once, storing function pointers or a dispatch table. Calls then go to the best available variant. The portable version is always present and serves as the correctness reference. Dispatch cost must be negligible, so the choice is cached. Compile-time feature selection is an alternative that removes the indirection but produces binaries tied to hardware. The hard part is testing every variant on hardware that has it.",
    k: ["Runtime detection versus compile-time selection: runtime runs well on any machine in one binary, while compile-time removes indirection and risks illegal instructions on older CPUs.", "Dispatching per call versus per pattern: per pattern avoids repeated indirection, while per call is simple."],
    p: ["Running a vector routine on a CPU or virtual machine that does not support it, crashing with an illegal instruction.", "Fast path never tested in CI because test hardware lacks it."],
    v: "Force each variant in turn on a test machine supporting it and confirm identical results from the scan test suite, and confirm that disabling features at startup selects the portable path.",
    dep: []
  },
  "table-generation": {
    s: "Build-time programs that convert Unicode data files into compact tables compiled into the engine, so lookup tables are reproducible and versioned.",
    d: "A generator reads the Unicode data files and emits sorted range lists, case fold maps and multi-stage lookup arrays in source form. Generated files are checked in or built during the build, and the Unicode version is recorded. Tests compare the generated output to the data. Updating Unicode means rerunning the generator and reviewing the differences. The hard part is keeping generated tables small and making their changes reviewable when thousands of ranges change between versions.",
    k: ["Generating at build time versus checking in output: build-time always matches the data, while checked-in output makes builds simple and diffs reviewable.", "Optimizing tables for size versus lookup speed: size shrinks the binary, while speed favors larger direct tables."],
    p: ["Updating tables without regenerating dependent artifacts, such as case folding, leaving inconsistent versions.", "Generated files edited by hand and later overwritten."],
    v: "Regenerate tables from the data files in a clean checkout and confirm the output is byte-identical to the committed files, and that a lookup test against the data passes for all code points.",
    dep: []
  },
  "automaton-serialization": {
    s: "Writes a compiled automaton to bytes and loads it back without recompiling, so startup can skip compilation and tables can be embedded in programs.",
    d: "Serialization stores states, transitions, class maps and start states in a fixed layout with a header carrying version, endianness and alignment. Loading validates the header and structure, and can use the bytes in place without copying. This helps programs with fixed pattern sets, where compile time and memory at startup matter. It applies to full DFAs more than lazy ones. The hard part is trust: a loaded automaton from an untrusted source must be validated or it can cause out-of-bounds reads, and format changes need versioning.",
    k: ["Using serialized bytes in place versus deserializing into new memory: in place is instant and shares pages, while deserializing is simpler and independent of alignment.", "Validating on load versus trusting the source: validation is safe but costs time proportional to size, while trusting is instant but unsafe for external data."],
    p: ["Loading an automaton written for a different endianness or version and reading garbage.", "Skipping validation for data from disk that an attacker can modify."],
    v: "Serialize a DFA, load it in a fresh process, and confirm identical match results with no compile step. Corrupt a byte and confirm loading rejects it or search stays in bounds.",
    dep: ["full-dfa-precompile", "arena-allocation"]
  }
});
