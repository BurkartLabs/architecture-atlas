// Details for the FPGA toolchain plate, part 3: constraints, synthesis, optimization and mapping.
ATLAS.details("fpga-toolchain", {
  "clock-definitions": {
    s: "Declare each clock's source, period, waveform and relationships, such as generated or derived clocks, so timing analysis knows what every register is measured against.",
    d: "A primary clock is defined on an input pin or oscillator with a period and duty cycle. Clocks produced by dividers, multipliers or clock management blocks are declared as generated clocks tied to a source, or derived automatically. Groups of clocks can be marked asynchronous to each other. Everything in timing analysis depends on these definitions. They are hard because a missing or wrong definition makes paths unconstrained or analyzed against the wrong edges, and the tool reports success either way.",
    k: ["Derive generated clocks automatically versus declare each by hand: automatic derivation is less work, manual declaration is explicit and survives changes in clocking structure.", "Declare clocks asynchronous versus handle crossings with exceptions: declarations are compact but also remove checking of genuine crossings."],
    p: ["A clock defined on the wrong pin leaves the real clock unconstrained, and the report shows no failures.", "Declaring two clocks asynchronous hides a real synchronous path between them."],
    v: "Run the unconstrained-path report after defining all clocks and confirm it lists zero registers without a clock, then change one period and confirm slack in that domain moves accordingly.",
    dep: ["constraint-interpreter", "clock-propagation"]
  },
  "pin-and-io-standards": {
    s: "Assign each top-level port to a physical package pin and set its electrical standard, drive strength, termination and slew, matching the board.",
    d: "Every design port gets a pin location and an I/O standard from the device's supported list. Banks group pins that share a supply voltage, so standards in one bank must be compatible. Extra attributes cover pull-ups, differential pairing and input delay taps. It is where the design meets the board schematic. It is hard because errors are physical: a wrong voltage standard can damage hardware, and the tools may accept a combination that the board cannot support.",
    k: ["Pin assignments in the constraint file versus in the source: constraint files keep source portable across boards, source attributes keep assignments next to the port.", "Let the tool choose pins versus fix all pins early: letting the tool choose helps placement, fixing early lets the board be laid out in parallel."],
    p: ["Pin names copied from an older board revision connect signals to the wrong physical pins.", "A bank holds two incompatible standards, and the tool reports only a warning."],
    v: "Cross-check the generated pin report against the board schematic net list for every port and confirm location, standard and bank voltage agree on all pins.",
    dep: ["package-pin-map", "constraint-interpreter", "design-rule-checks"]
  },
  "delay-constraints": {
    s: "State how late data arrives at inputs and how early it must leave outputs relative to a clock, modeling the external devices the chip talks to.",
    d: "Input delay constraints give the time between a clock edge at an external chip and the data arriving at the pin, with minimum and maximum values. Output constraints give setup and hold requirements at the receiving chip. Board trace delays are included. Without them the tool cannot check any interface. They are hard because the numbers come from other chips' data sheets and board layout, and because source-synchronous interfaces need careful handling of their forwarded clocks.",
    k: ["Constrain with data sheet values versus with margin added: exact numbers can be too optimistic, margin protects against variation but can make closure harder than needed.", "Source-synchronous modeling versus system-synchronous: source-synchronous reflects real captured edges, system-synchronous is simpler but pessimistic at high rates."],
    p: ["Setup values entered where hold values are required, so a failing interface appears to pass.", "Interface paths left unconstrained because the data sheet numbers were never obtained."],
    v: "Constrain an input with the external chip's data sheet values, route, and confirm the report shows the input path slack, then verify on hardware that the interface runs error free across temperature and voltage extremes.",
    dep: ["clock-definitions", "constraint-interpreter"]
  },
  "timing-exceptions": {
    s: "Declare paths that are not subject to the normal single-cycle check, such as false paths, multicycle paths and maximum delays, so analysis matches real behavior.",
    d: "A false path tells the tool to ignore a path that cannot be sensitized or is handled elsewhere. A multicycle path allows data several clock periods to propagate when the design guarantees it. A max-delay constraint bounds a crossing without a clock relationship. Each exception removes or relaxes checking. They are necessary because a naive analysis fails legitimate designs. They are dangerous because each one is a promise by the engineer that the tool cannot verify.",
    k: ["Broad wildcard exceptions versus precise path-specific ones: wildcards are short but can cover paths nobody intended; precise ones are verbose and break when names change.", "Exceptions in the constraint file versus enforced by design structure: file exceptions are easy to add, structural handling such as synchronizers is checked by simulation."],
    p: ["A false path covering the wrong endpoints hides a real failure that appears in hardware at one temperature.", "Multicycle exceptions kept after the clock ratio changes now allow too much delay."],
    v: "List all exceptions with the number of paths each covers, confirm every one matches a documented design reason, and confirm removing one makes the expected paths appear in the timing report.",
    dep: ["clock-definitions", "constraint-interpreter", "cdc-analysis"]
  },
  "floorplan-constraints": {
    s: "Restrict groups of cells to chosen rectangular regions of the device, fix specific cells to sites, and reserve space, to guide placement and isolate modules.",
    d: "Region constraints assign a module's cells to a region of tiles. Location constraints place specific cells on specific sites, common for clock-sensitive or board-critical logic. Regions can be required to be exclusive for partial reconfiguration. They help hierarchical flows, reuse and timing between known blocks. They are hard because they work against the placer's freedom: a poor region can make a design unroutable, and they must be revisited when the design changes size.",
    k: ["Manual floorplan versus automatic placement: manual control makes critical blocks predictable and reproducible, automatic placement usually reaches better results on the whole design.", "Rectangular regions versus arbitrary shapes: rectangles are simple and match the grid of reconfigurable regions, arbitrary shapes fit awkward blocks but are harder to maintain."],
    p: ["A region sized for an earlier version of the module overflows after growth, and the placer fails with an unhelpful message.", "Over-constraining placement for timing closure that would have succeeded freely."],
    v: "Constrain a module to a region and confirm that after placement every cell of the module lies inside it, and that the utilization of the region reported matches the module's resource count.",
    dep: ["constraint-interpreter", "tile-and-site-model", "global-placement"]
  },
  "constraint-interpreter": {
    s: "Reads constraint files, resolves object names and patterns against the current design, applies them to the database and reports any that matched nothing or conflict.",
    d: "Constraints are commands that select objects with name patterns and set properties on them. The interpreter evaluates them in order, against the netlist at the stage being run, and stores the result as attributes and timing rules. Different stages see different netlists, so the same constraint can match before synthesis and not after. It is hard because order matters, because patterns are ambiguous, and because silent no-match is the most common failure of all.",
    k: ["Treat unmatched patterns as errors versus warnings: errors catch typos and stale names at once, warnings keep old constraint files usable across edits.", "Apply constraints early at synthesis versus only at implementation: early application guides optimization, late application is simpler but wastes synthesis effort."],
    p: ["A constraint matches nothing because optimization renamed the cell, so a requirement quietly vanishes.", "Order dependence: the same file gives different results when one line moves."],
    v: "Load a constraint file with one deliberately misspelled net name and confirm the interpreter lists it as unmatched with its line number, while all valid constraints appear in the applied-constraint report.",
    dep: ["design-hierarchy-model", "command-engine", "netlist-storage"]
  },
  "register-and-latch-inference": {
    s: "Recognizes clocked and level-sensitive behavior in the source and maps it to flip-flops, latches and their control signals such as enable, set and reset.",
    d: "The synthesizer examines each process: if a signal is assigned only on a clock edge it becomes a register; if it keeps its value in some branches it infers a latch. Clock enable, synchronous and asynchronous reset patterns are matched to the control pins the device flip-flop actually has. Registers sharing controls are grouped. It is hard because source that looks innocent can infer unintended latches, and the choice of reset style changes whether the device primitive can be used directly.",
    k: ["Asynchronous versus synchronous reset: asynchronous responds immediately but complicates timing and recovery checks, synchronous fits device registers and is timed like data.", "Infer latches when written versus forbid them: allowing them supports rare intentional designs, forbidding catches accidental ones early."],
    p: ["An incomplete conditional infers a latch that works in simulation and glitches in hardware.", "A reset applied to every register consumes routing and constrains packing."],
    v: "Synthesize a process with a missing else branch and confirm the log reports an inferred latch with its signal name, then add the branch and confirm the latch is gone from the netlist.",
    dep: ["elaboration", "generic-netlist-ir", "lint-checks"]
  },
  "fsm-extraction": {
    s: "Detects state machines in the design and re-encodes their states, one-hot or binary or another form, to improve speed or area and to enable further optimization.",
    d: "The tool identifies a register whose value is compared against constants and assigned from constants, treats it as a state variable, and builds a graph of states and transitions. It can remove unreachable states, merge equivalent ones and choose an encoding. One-hot uses more registers but shallower logic. It is hard because re-encoding changes how the state looks to debug and to formal tools, and incorrect detection can break a register that merely looks like a state machine.",
    k: ["One-hot versus compact binary encoding: one-hot has shallow next-state logic and suits registers-rich devices, binary saves registers and suits small machines.", "Automatic encoding versus honoring the designer's: automatic usually finds the fast form, honoring the author's keeps debug and safe-state behavior intact."],
    p: ["Re-encoding removes the safe-state recovery the designer wrote, so a bit flip leaves the machine stuck.", "A debug probe attached to the state register no longer shows readable values."],
    v: "Synthesize a known eight-state machine and confirm the log reports extraction with the chosen encoding and the number of states, and that simulation of the netlist follows the same state sequence.",
    dep: ["register-and-latch-inference", "generic-netlist-ir"]
  },
  "memory-inference": {
    s: "Recognizes arrays with read and write behavior in the source and maps them to the device's memory resources, deciding block memory, distributed memory or registers.",
    d: "Array accesses are analyzed for depth, width, number of ports, read-during-write behavior and whether reads are registered. If the pattern matches a block memory primitive, one is used; small or asynchronous-read memories go to logic. Initial contents become configuration data. Memory is scarce, so the choice matters. It is hard because tiny differences in how the code is written, such as an unregistered read, change which primitive can be used and may inflate area by an order of magnitude.",
    k: ["Infer memories from behavior versus instantiate primitives by hand: inference is portable across devices, instantiation gives exact control and survives tool changes.", "Prefer block memory versus distributed: block memory saves logic at fixed granularity, distributed memory suits small shallow arrays and asynchronous reads."],
    p: ["An asynchronous read forces a large array into registers and consumes most of the logic.", "Different read-during-write behavior between simulation and hardware gives data that differs by one cycle."],
    v: "Write a 1024 by 16 array with registered read, synthesize it and confirm the utilization report shows a block memory and no extra logic; remove the register on the read and confirm the mapping changes.",
    dep: ["elaboration", "memory-primitive-mapping", "generic-netlist-ir"]
  },
  "arithmetic-inference": {
    s: "Detects adders, multipliers, comparators and accumulators in expressions and prepares them for the carry chains and multiplier blocks the device provides.",
    d: "Operators in the source are turned into structures with a known cost: an adder becomes a chain of full-adder bits, a multiply with constant operands becomes shifts and adds, and a multiply-add pattern is flagged for a dedicated block. Widths are propagated and sign handling made explicit. The result drives later mapping. It is hard because operand widths grow through expressions, so a careless width can waste an entire block, and because inference rules differ between operator patterns.",
    k: ["Infer from operators versus instantiate vendor arithmetic blocks directly: inference is portable and readable, direct instantiation guarantees the structure but ties the code to one family.", "Optimize constant multipliers into adders versus keep one multiplier block: shift-add saves blocks and costs logic and depth, a block is compact and fast."],
    p: ["An accumulator wider than the dedicated block's accumulator spills into logic and halves the achievable clock.", "Signed and unsigned operands mixed silently change a result."],
    v: "Write a 18 by 18 signed multiply-add with registered output, synthesize and confirm the report maps it to exactly one dedicated arithmetic block, then widen one operand and observe the mapping change.",
    dep: ["elaboration", "dsp-packing", "carry-chain-mapping"]
  },
  "hierarchy-handling": {
    s: "Decides whether module boundaries are kept, flattened for optimization, or synthesized separately, balancing quality of result against run time and name stability.",
    d: "Flattening removes boundaries so logic can be optimized across modules, often giving the best area and speed. Keeping hierarchy preserves names for constraints and debug, and lets each module be synthesized once and reused, which speeds up incremental runs. Rules can be set per module with attributes. It is hard because the choice interacts with everything: constraints, timing, incremental compilation and partial reconfiguration all expect different amounts of structure.",
    k: ["Flatten everything versus keep selected modules: flattening reaches the best optimization, keeping gives stable names and faster reruns.", "Synthesize modules out of context versus in context: out-of-context caches results and parallelizes, in-context sees real surroundings and constants."],
    p: ["Flattening dissolves the module a constraint targeted, so that constraint stops matching.", "Out-of-context synthesis misses a constant tied at the top, leaving unused logic in the module."],
    v: "Synthesize with a module kept and again flattened, and confirm the first run's netlist still contains the module instance by name while the second shows its cells merged into the parent with fewer total cells.",
    dep: ["design-hierarchy-model", "generic-netlist-ir", "flat-vs-hierarchical"]
  },
  "resource-sharing": {
    s: "Merges operations that never occur at the same time onto one operator, or identical logic into one copy, to reduce area at the cost of added multiplexing.",
    d: "If two additions sit in mutually exclusive branches, one adder with a multiplexer on its inputs can serve both. Common subexpressions are computed once. The pass uses control-flow analysis to prove exclusion. It reduces expensive operators, especially multipliers and wide adders. It is hard because the multiplexers added can cost more than the operator saved on devices where multiplexing is expensive, and because sharing deepens paths that timing may then reject.",
    k: ["Share expensive operators only versus share everything: sharing only large operators is clearly profitable, sharing small ones adds logic and delay.", "Share before timing is known versus after analysis: before is simple, after can avoid sharing on critical paths but needs a loop with timing feedback."],
    p: ["Shared operator on a critical path turns a timing-clean design into a failing one.", "Exclusion analysis misses a case and merged logic changes functionality."],
    v: "Synthesize two mutually exclusive multiplications with sharing on and off and confirm the on case uses one multiplier block against two, with a multiplexer visible in the netlist and identical simulation results.",
    dep: ["generic-netlist-ir", "arithmetic-inference"]
  },
  "generic-netlist-ir": {
    s: "The technology-independent gate-level representation that synthesis produces and optimizes, made of simple logic, registers, memories and arithmetic cells before mapping.",
    d: "Cells at this stage are generic: and, or, multiplexer, adder, register with enable and reset, memory with ports. They carry widths, connections, names, source locations and attributes. Optimization passes rewrite this graph, and mapping converts it to device primitives. It must hold enough structure to infer good hardware but be uniform enough for many passes. It is hard because every pass must preserve names, constraints and source links, or later stages cannot report anything meaningful.",
    k: ["Word-level cells versus a bit-level and-inverter graph: word-level preserves arithmetic and enables inference of dedicated blocks, bit-level is uniform for logic optimization but loses structure.", "Keep source locations on every cell versus drop them for speed: locations enable cross-probing, but add memory and must be maintained through rewriting."],
    p: ["A pass that creates cells without inheriting names yields reports full of anonymous objects.", "Converting to bit level too early destroys structures later mapping needs."],
    v: "Write the netlist after synthesis in an exchange format, read it into a simulator, and confirm its behavior matches the source simulation on the same test inputs.",
    dep: ["netlist-storage"]
  },
  "boolean-optimization": {
    s: "Simplifies logic by constant propagation, removing redundant and unreachable logic, restructuring expressions and sharing common terms, without changing function.",
    d: "Passes fold constants, remove logic with no observable output, simplify using don't-care conditions, and factor expressions. Some passes use algorithms that find equivalent nodes by simulation and proof. The goal is fewer and shallower gates, which lowers area and delay. It is hard because optimization can remove logic the user wanted for debug or timing, because heavy algorithms take long on big designs, and because the improvements are measured on an estimate of delay.",
    k: ["Aggressive restructuring versus conservative cleanup: aggressive passes shrink logic more but destroy names and take longer, conservative ones keep the netlist recognizable.", "Optimize for area first versus for delay first: area-first gives compact designs, delay-first pushes frequency at the cost of duplicating logic."],
    p: ["Logic that appears unused is removed, along with the probe or keep attribute the engineer relied on.", "Optimization effort grows superlinearly and a huge design hits the time limit."],
    v: "Synthesize a design with a block whose output is unused and confirm the cells are removed from the result, then add a keep attribute and confirm they remain, with equivalence checking passing both times.",
    dep: ["generic-netlist-ir", "equivalence-between-stages"]
  },
  "lut-mapping": {
    s: "Covers the optimized logic graph with lookup tables of the device's input count, choosing groupings that minimize depth first and then area.",
    d: "Logic is cut into small functions that each fit one lookup table of, say, six inputs. The mapper enumerates candidate cuts per node, chooses a cover that minimizes the longest path in table levels, then recovers area by reusing shared cuts. It uses delay estimates that are only approximate before placement. It is hard because depth optimality can inflate area, and because the best table grouping depends on what the packer and carry chains can do afterward.",
    k: ["Minimize depth then recover area versus minimize area directly: depth-first suits frequency-critical designs, area-first fits tight devices.", "Map with estimated delays versus feedback from placement: estimates are available at once, feedback is accurate and requires repeating the mapping."],
    p: ["A depth-optimal map duplicates logic enough that utilization rises and routing congests.", "Estimated delays hide a long net, so the mapped depth looks fine and fails after routing."],
    v: "Map a known adder tree and confirm the report lists logic levels matching the expected depth for the table size, then compare a later timing report to see the path has no more levels than reported.",
    dep: ["boolean-optimization", "primitive-definitions", "delay-models"]
  },
  "carry-chain-mapping": {
    s: "Assigns adders, counters and comparators to the dedicated fast carry logic of the device, rather than building them out of general lookup tables.",
    d: "Fabric includes dedicated carry paths running vertically through a column of logic. The mapper recognizes arithmetic patterns, cuts them into chain segments that fit the column length, and ties the segments together. Chains must be placed as one contiguous column, which constrains the placer. They give much faster addition than lookup tables. They are hard because a long chain forces placement into a column, because chains are inflexible, and because logic merged into a chain's inputs can deepen it.",
    k: ["Use carry chains for all arithmetic versus only for wide operands: chains are faster and smaller for wide operators, but for tiny ones the placement restriction outweighs the gain.", "Allow chain splitting versus require whole chain per column: splitting fits fragmented devices, but adds a slow crossing."],
    p: ["Very long chains span clock regions and cap the clock frequency by their length.", "Logic placed in front of the chain inputs defeats the pairing and falls back to lookup tables."],
    v: "Synthesize a 64-bit adder and confirm the netlist uses carry primitives for all bits, then place it and confirm the chain occupies consecutive sites in one column.",
    dep: ["arithmetic-inference", "primitive-definitions", "packer"]
  },
  "retiming": {
    s: "Moves registers across combinational logic to balance path delays and raise the clock frequency without changing the cycle-level function seen at the outputs.",
    d: "Pipeline imbalance wastes time: one stage has slack while the next fails. Retiming relocates registers forward or backward through logic, keeping the same total latency, to equalize stages. It needs initial state to be recomputed for moved registers. It is hard because registers with reset or enable, those at hierarchy boundaries and those marked as keep cannot move freely, and because simulation after retiming no longer matches the original at internal signals.",
    k: ["Automatic retiming versus designer-placed pipeline registers: automatic is easy and adapts to device changes, manual is predictable and keeps debug signals meaningful.", "Backward retiming across hierarchy versus staying inside modules: crossing boundaries finds more gain, and breaks constraints and names."],
    p: ["Registers cannot cross a boundary with different reset values, so the expected gain never appears.", "Debug probes land on logic whose registers were moved, showing values one stage off."],
    v: "Synthesize an unbalanced two-stage pipeline with and without retiming, confirm the worst path shrinks in the timing report, and confirm output waveforms match cycle for cycle in simulation.",
    dep: ["generic-netlist-ir", "static-timing-engine", "equivalence-between-stages"]
  },
  "register-duplication": {
    s: "Copies a register or driver with high fanout so each copy drives fewer loads, shortening nets and letting the placer put copies near their loads.",
    d: "A register driving thousands of loads needs long routes and has large delay. The tool clones it and divides the loads among the copies, either at synthesis using fanout limits or after placement when actual positions are known. Cloning adds registers but reduces net delay. It is hard because copies must be kept equivalent, the right fanout depends on placement, and cloning can move the problem rather than solve it.",
    k: ["Set a maximum fanout during synthesis versus clone after placement: early limits are simple and predictable, late cloning uses real positions and fixes only what failed.", "Clone the driver register versus insert buffers: cloning removes logic delay, buffering adds delay and uses less area."],
    p: ["Duplicated reset registers diverge after a glitch because copies are not tied to each other.", "A fanout limit applied to everything inflates register count with no benefit on noncritical nets."],
    v: "Set a fanout limit of 100 on a net with 1000 loads, synthesize and confirm the netlist shows ten copies, each with about 100 loads, and a better slack on that net's paths.",
    dep: ["generic-netlist-ir", "physical-optimization", "timing-driven-routing"]
  },
  "memory-primitive-mapping": {
    s: "Maps inferred memories onto physical block memories, choosing their aspect ratios, cascading several for depth, adding glue for width, and assigning ports.",
    d: "A block memory supports a few fixed shapes, say deep and narrow or shallow and wide. A larger logical memory is built from several blocks in parallel for width or in series with multiplexing for depth. Optional output registers are absorbed. Byte write enables and initialization are mapped. It is hard because the mapping affects both memory count and timing: cascades add delay, and unevenly sized memories waste capacity.",
    k: ["Choose the shape minimizing block count versus minimizing delay: fewest blocks saves a scarce resource, shape tuned for delay avoids a deep cascade.", "Absorb output registers into the block versus use fabric registers: absorbing saves logic and improves clock to output, but ties the design to the block's register behavior."],
    p: ["A memory slightly larger than a block's capacity doubles the block count.", "Initialization contents missing from the bitstream because the mapping dropped the initial values."],
    v: "Map a 3000 by 18 memory and confirm the report lists the expected number of blocks and shape, then load the bitstream and read back initial contents against the source file.",
    dep: ["memory-inference", "primitive-definitions", "device-database"]
  },
  "dsp-packing": {
    s: "Maps multiplications, additions and accumulations onto dedicated arithmetic blocks, absorbing neighboring pipeline registers and pre- and post-adders into the block.",
    d: "Each block contains a multiplier, an adder or accumulator and optional registers at its input, middle and output. The mapper matches an expression tree to these stages, absorbs registers when the pipeline depth fits, and cascades blocks for wide operands or filters. It is hard because patterns that nearly match a block need exact register placement, and because absorption into a block moves registers that debug and retiming expected to find.",
    k: ["Absorb surrounding registers versus leave them in fabric: absorbing gives the highest frequency and the smallest area, fabric registers keep visibility but limit speed.", "Use blocks for small multiplies versus logic: blocks are fast but scarce, small constants are cheaper in lookup tables."],
    p: ["A missing pipeline register stops the multiplier block from reaching its rated speed.", "The device's blocks run out and the remaining multiplies use thousands of lookup tables."],
    v: "Synthesize a four-tap filter with registered multiply and accumulate, and confirm the utilization report lists exactly four arithmetic blocks with no multiply logic left in lookup tables and the timing path meets the block's rated speed.",
    dep: ["arithmetic-inference", "primitive-definitions", "resource-binding"]
  },
  "clock-resource-mapping": {
    s: "Assigns clocks to the device's dedicated clock buffers, management blocks and routing, inserting buffers and choosing which clocks go to global or regional networks.",
    d: "Clock signals should travel on dedicated low-skew networks, not general routing. The mapper inserts clock buffers where the source requires them, maps frequency synthesis and phase shifting to the device's management blocks, and decides global or regional distribution. Gated and divided clocks are converted to enables where possible. It is hard because the number of global networks is limited, and because a clock that falls on ordinary routing causes skew and unreliable timing.",
    k: ["Convert gated clocks to clock enables versus keep gating: enables stay on one network and time cleanly, true gating saves power and complicates analysis.", "Global buffer per clock versus regional: global reaches everywhere and is scarce, regional is plentiful and limited to one area."],
    p: ["More clocks than global networks exist, so some silently land on slow general routing.", "A clock generated in fabric logic is not recognized and is analyzed as data."],
    v: "Inspect the clock report to confirm every clock net uses a dedicated buffer, the count is within device limits, and measured skew between registers in one domain is below the report's stated figure.",
    dep: ["generic-netlist-ir", "clock-definitions", "clock-network-routing"]
  },
});
