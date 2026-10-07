// Details for the blockchain node plate, part 3: execution, state, syncing, storage.
ATLAS.details("blockchain-node", {
  "state-transition-function": {
    s: "The pure function that takes a parent state and a block and returns the next state, defining exactly what each transaction does and in what order.",
    d: "For each transaction in order, the function checks validity, charges the maximum fee, runs the payload (a transfer, or contract code), applies the resulting state changes, refunds unused resource, and pays the producer. After all transactions it applies block-level effects such as rewards and validator updates. The output is the new state plus receipts. It is the single most consensus-critical piece of code: every node, in every implementation, must produce the same result for the same inputs. The challenge is that it must be exact, fast and safe against hostile inputs.",
    k: ["Strict sequential execution versus declared-dependency parallel execution: sequential is simple and exactly specified, while parallel execution exploits cores but must produce results identical to sequential order.", "Failed transactions consume fees and stay in the block versus being excluded: keeping them pays producers for the work and keeps blocks self-contained, but wastes block space."],
    p: ["A differing edge case, such as how a refund is rounded, produces different state roots on different clients.", "Reading anything outside the declared inputs, such as the local clock, makes the function nondeterministic."],
    v: "Execute a recorded block on two independent clients from the same parent state and confirm the resulting state root, receipt commitment and resource totals are identical to the header.",
    dep: ["virtual-machine","gas-metering","authenticated-state-tree","state-journal"]
  },
  "virtual-machine": {
    s: "A sandboxed, deterministic interpreter that runs contract code identically on every node, with no access to anything outside the chain's own state.",
    d: "The machine has a stack or registers, a memory that grows on demand, access to contract storage, and a set of instructions. Execution starts from a call with input data and ends with output, a revert or an exhausted resource limit. It has no clock, no randomness and no network. Every instruction has a defined cost. The design challenge is determinism and safety at once: untrusted code from anyone must run quickly, with no way to escape, hang or behave differently across hardware.",
    k: ["Custom instruction set versus a general-purpose portable bytecode: a custom set can bake in chain concepts and exact costs, while a portable one reuses existing tooling but needs careful restrictions for determinism.", "Interpret versus compile ahead of time: interpretation is simple to specify and verify, while compilation is faster but adds a compiler whose bugs become consensus bugs."],
    p: ["Floating-point or hardware-dependent behavior leaks in and gives different results on different processors.", "A machine bug that lets code read memory it should not break the sandbox on every node at once."],
    v: "Run a conformance suite of programs including stack overflow, out-of-range memory and deep recursion, and confirm each ends with the specified status, output and resource charge on every client.",
    dep: ["instruction-set","gas-metering","contract-calls","deterministic-execution"]
  },
  "instruction-set": {
    s: "The list of operations the machine can perform, with each one's exact semantics, stack effects, error conditions and cost.",
    d: "Instructions cover arithmetic on fixed-width integers, comparisons, bitwise operations, hashing, memory and storage access, environment queries such as block number and caller, control flow with validated jump targets, and calls. Each entry defines behavior on overflow, on invalid input and when resources are insufficient. New instructions arrive with upgrades, activated by fork rules, so an instruction's meaning may depend on the block. The hard part is the long tail: every corner of every instruction becomes permanent, because old blocks must replay identically forever.",
    k: ["Few primitive instructions versus many specialized ones: a small set is easier to verify and secure, while specialized ones make common work cheaper in cost units but enlarge what every client must get right.", "Wide fixed-width integers with wraparound versus checked arithmetic: wraparound is simple and uniform, but pushes overflow checks onto contract authors."],
    p: ["An instruction with an unspecified case, such as division by zero, is implemented differently by two clients.", "Repricing an instruction that existing contracts depend on makes some of them suddenly too expensive to run."],
    v: "Run the per-instruction conformance suite covering each normal, boundary and failing input and confirm result, stack effect and charge for every case match the specification table.",
    dep: ["gas-metering","protocol-parameters"]
  },
  "gas-metering": {
    s: "The accounting that assigns every operation a cost in resource units, charges it as code runs, and halts execution when the sender's limit is exhausted.",
    d: "Each instruction and each state access has a price in units that approximate its cost to nodes: computation, memory growth, disk access and permanent storage. A transaction declares a limit and pays for the units used. Execution stops with an out-of-resource error when the limit is reached, discarding state changes but keeping the fee. Metering solves the halting problem for untrusted code. It is hard because the cost model is a security boundary: any operation that is cheap but slow becomes a denial-of-service lever.",
    k: ["Single unit for all resources versus separate meters for computation, storage and data: one unit is simple for users, but misprices resources whose scarcity differs, while separate meters price accurately and complicate fees.", "Static cost per instruction versus cost depending on state: static costs are simple, but access costs that ignore warm and cold storage misprice real disk work."],
    p: ["An underpriced operation lets an attacker fill blocks with work that is cheap to send and slow to execute.", "Raising the price of an operation breaks existing contracts that had hard-coded the old amount."],
    v: "Execute a transaction with a limit one unit below its actual cost and confirm it halts with an out-of-resource status, reverts its changes, charges the full limit and leaves other accounts untouched.",
    dep: ["virtual-machine","instruction-set","fee-market"]
  },
  "contract-calls": {
    s: "How contract code invokes other contracts and creates new ones, with nested execution contexts that can succeed or revert independently.",
    d: "A call creates a new frame with its own memory and limited share of the remaining resource, passes input and optional value, and runs the callee. If the callee reverts, its state changes are undone while the caller continues and sees the failure. Creation runs initialization code and stores the returned code at a derived address. Calls are bounded by depth. The difficulty is reentrancy: the callee can call back into the caller midway, and every contract must handle being observed in an intermediate state.",
    k: ["Callers keep control after a failed call versus propagate failures automatically: manual handling gives flexibility, but makes unchecked failures a common vulnerability.", "Forward all remaining resource versus a fixed fraction: forwarding everything is simple but lets the callee consume it all, while a fraction keeps a reserve for the caller to finish."],
    p: ["Updating state after an external call allows the callee to re-enter and act on stale values.", "Unbounded call depth lets a chain of calls exhaust the node's native stack."],
    v: "Run a contract that calls another which reverts and confirm the callee's writes are absent, the caller's earlier writes remain, and the failure code is visible to the caller.",
    dep: ["virtual-machine","state-journal","gas-metering"]
  },
  "precompiled-functions": {
    s: "Built-in functions at fixed addresses that run natively for expensive operations such as signature recovery, hashing or pairing checks, priced separately from ordinary code.",
    d: "Some operations would be far too slow or costly if written in the machine's own instructions. The protocol therefore defines native routines callable like contracts. Each has a fixed input format, output and a cost formula that depends on input size. Because they are native code, they are a consensus-critical surface: every client must implement them identically, bit for bit, including their error cases. They are a way to add cryptographic capability without changing the instruction set.",
    k: ["Native routine versus implement in contract code: native code is orders of magnitude faster and cheaper, but adds permanent protocol surface and a cost formula that must stay accurate.", "Add new routines through forks versus allow user-supplied native code: forks keep the set small and reviewed, but slow the adoption of new primitives."],
    p: ["A cost formula that underestimates worst-case inputs turns a cheap call into a denial-of-service tool.", "Library differences in rejecting malformed input lead to disagreement on one specially crafted call."],
    v: "Call each routine with valid, boundary and malformed inputs from the shared vectors and confirm output bytes, error status and charge are identical on all clients.",
    dep: ["digital-signatures","hash-functions","proof-verification","gas-metering"]
  },
  "event-logs": {
    s: "Append-only records that contracts emit during execution, stored in receipts, indexed by topics and readable by outside observers but not by contracts.",
    d: "A contract emits an entry with the emitter address, up to a few indexed topics and an opaque data payload. Entries are cheaper than storage because contracts cannot read them back. They are collected per transaction into the receipt, committed to by a root in the header, and summarized by a bloom filter for quick lookups. Applications use them as the history of what happened. Because they are committed, a light client can verify an event with a proof against the header.",
    k: ["Logs outside state versus data in storage: logs cost far less and are good for history, but contracts cannot rely on them as state.", "Indexed topics versus opaque data: indexed fields allow filtering without scanning, but each topic adds cost and the number of indexed fields is limited."],
    p: ["Relying on a log for a decision inside a contract is impossible, so developers duplicate data into storage to be safe.", "Events from a transaction that reverted do not exist, which surprises clients that watch only for submissions."],
    v: "Execute a transaction that emits two events and confirm both are in the receipt with correct topics, that the receipt commitment includes them, and that a transaction that reverted emits none.",
    dep: ["transaction-receipts","block-commitments","log-and-event-queries"]
  },
  "transaction-receipts": {
    s: "The per-transaction result record: success or failure, resource used, and the events emitted, committed to by a root in the block header.",
    d: "After a transaction executes, the node writes a receipt holding a status, the cumulative resource consumed in the block so far, the logs and a bloom filter of them. All receipts of a block are organized into a tree whose root goes in the header. The result is that a transaction's outcome is as verifiable as its inclusion. Receipts are derived data: they can be recomputed by re-execution, but storing them makes queries cheap, and nodes that prune them need to be able to regenerate them.",
    k: ["Store receipts for all history versus recompute on demand: storage makes queries instant, but costs disk, while recomputation needs old state and is slow.", "Cumulative resource field versus per-transaction field: cumulative values make the receipt tree self-checking, but require summing to get a single transaction's cost."],
    p: ["A receipt that omits a failure reason leaves clients unable to tell a revert from an out-of-resource halt.", "Pruning receipts while keeping the headers that commit to them prevents later proofs about old events."],
    v: "Execute a block of 50 transactions with some failing, recompute the receipt tree root from stored receipts and confirm it equals the root in the block header.",
    dep: ["state-transition-function","block-commitments","merkle-tree-library"]
  },
  "deterministic-execution": {
    s: "The discipline that code run by consensus produces identical output on every machine, avoiding every source of variation such as time, randomness, ordering and platform differences.",
    d: "Anything that varies across nodes must be removed from consensus-critical paths: iteration order of hash maps, floating-point results, thread scheduling, memory addresses, locale and the local clock. Inputs are limited to the block, the state and the transaction. Parallel execution must be arranged so the observable result equals sequential execution. This is enforced by specification, review and differential testing, because a single nondeterministic path can make a node silently fork off.",
    k: ["Ban floating-point and unordered iteration entirely versus allow with care: a ban removes a class of divergences, but costs convenience and sometimes performance.", "Define behavior for every input versus leave some undefined: full definition prevents disagreement but is more work, while undefined behavior is where clients diverge."],
    p: ["A map iterated in hash order during reward calculation gives different totals on different runs.", "An optimization that changes the order of side effects passes unit tests and diverges under rare conditions."],
    v: "Run the same block 1,000 times with randomized thread scheduling, hash seeds and memory layout and confirm the resulting state root is identical every time and on a second implementation.",
    dep: ["consensus-test-vectors","canonical-serialization"]
  },
  "authenticated-state-tree": {
    s: "A tree of hashes over all state entries, so one short root commits to every account and storage slot and any single entry can be proven against it.",
    d: "Entries are stored as leaves keyed by address or storage position, and each internal node holds the hash of its children. Updating an entry changes the hashes on the path to the root and nothing else, so cost per change is logarithmic. The tree can be a radix structure with compressed paths, or a sparse binary tree. Many variants exist, differing in branching factor and proof size. The hard part is cost: each state write touches several nodes, and the number of random disk reads per lookup is the main bottleneck of execution.",
    k: ["High branching factor versus binary: high branching gives shallow trees and fewer disk reads, but larger proofs, while binary trees give small proofs and deeper paths.", "Key by hash of the address versus by the address itself: hashing balances the tree against adversarial keys, but loses locality for neighboring entries."],
    p: ["Hash-collision-free keys chosen by an attacker to create a deep path make lookups slower for everyone.", "Writing every intermediate node on each block causes large write amplification."],
    v: "Insert 100,000 random entries, compute the root on two independent implementations, delete half and reinsert them, and confirm both roots match and the final root equals the original.",
    dep: ["hash-functions","state-database","canonical-serialization"]
  },
  "state-root": {
    s: "The single hash at the top of the state tree, placed in each block header, which every node must reproduce exactly after executing the block.",
    d: "After a block's transactions run and block-level effects are applied, the node computes the tree root and compares it to the header value. A match means the node's entire state is identical to the producer's, to the last bit. A mismatch means either the block is wrong or the node is, and the node cannot continue until resolved. Because it commits to everything, it also serves as the anchor for proofs and snapshots. It is expensive to recompute after every block, so implementations compute only the changed paths.",
    k: ["Recompute only dirty paths versus rehash everything: dirty-path computation is orders of magnitude faster, but needs careful tracking so no change is missed.", "Commit the post-state of this block versus the pre-state of the next: post-state lets a validator check its own work immediately, while pre-state delays verification but allows a block to be built without computing it."],
    p: ["A cached hash not invalidated after a write yields a wrong root that only some nodes compute.", "Computing the root synchronously inside block import blocks the node during heavy blocks."],
    v: "Execute a block with 1,000 state changes on two clients and confirm both roots equal the header value; then flip one stored balance and confirm the root changes.",
    dep: ["authenticated-state-tree","state-transition-function"]
  },
  "inclusion-proofs": {
    s: "A short list of sibling hashes that lets anyone verify that a given account, storage value or transaction is part of a committed root, without holding the whole data.",
    d: "To prove an entry, the node returns the entry and the hashes of the siblings along its path to the root. The verifier hashes up the path and compares to a root it already trusts, such as one from a finalized header. Proofs for absence work by showing the neighbors. Light clients and bridges rely on them. The difficulty is proof size and generation cost: deep trees with large branching produce kilobyte proofs, and generation needs access to the historical nodes.",
    k: ["Serve proofs from the node versus have a separate service: serving directly keeps trust local, but adds read load and requires historical nodes to be retained.", "Multi-proofs for many entries versus separate proofs: sharing common path nodes cuts size substantially, at the cost of more complex format and verification."],
    p: ["Verifying a proof against a root the verifier did not authenticate proves nothing.", "A node that pruned old trie nodes cannot generate proofs for old blocks."],
    v: "Request a proof for one account at a recent block, verify it offline against that block's state root, then change one proof hash and confirm verification fails.",
    dep: ["authenticated-state-tree","state-root","merkle-tree-library","proof-verification"]
  },
  "account-records": {
    s: "The data stored per account or address: balance, sequence number, and for contracts the code hash and the root of its own storage tree.",
    d: "The top-level state maps each address to a small record. Externally owned accounts have a balance and nonce. Contract accounts add a hash of their code and a root of a separate tree for their storage slots. Accounts are created implicitly when they first receive value. The record format is part of consensus. The challenge is growth: accounts and storage slots persist forever unless the protocol removes them, so state size increases with usage and so does the cost to run a node.",
    k: ["Empty accounts deleted automatically versus kept: deletion keeps state smaller, but needs precise rules for when an account counts as empty, which was itself a source of bugs.", "Separate storage tree per contract versus one flat tree: separate trees isolate contracts and allow independent proofs, but add depth and a second level of hashing."],
    p: ["Creating many tiny accounts permanently increases state for a one-time small fee.", "An address collision between an existing account and a new contract is unlikely but catastrophic, so creation rules must define behavior for it."],
    v: "Send value to a never-used address and confirm a record with that balance and a zero sequence number now exists in the state, and the state root changed.",
    dep: ["authenticated-state-tree","utxo-or-account-model"]
  },
  "state-journal": {
    s: "A log of changes made during execution that allows undoing part of it when a call reverts, and discarding everything if a block is invalid.",
    d: "Writes during execution go to an in-memory overlay, with each change recorded in an ordered journal. When a nested call fails, the journal is unwound to the point where the call began. At the end of a transaction, the overlay is merged into the block-level overlay. At the end of the block it is written to the database as a batch, only if the block is valid. The journal also supports reading values as they were before a change, which is needed for refunds and cost rules that depend on original values.",
    k: ["Journal of undo records versus copying the overlay at each call: undo records are cheap and precise, while copying is simpler but costs memory proportional to state touched.", "Commit to the database per transaction versus per block: per-block commits are atomic with the header and cheaper, but hold all changes in memory until the end."],
    p: ["A change not recorded in the journal survives a revert and leaks into state.", "Very large blocks build an overlay so large it exhausts memory before commit."],
    v: "Run a transaction in which a nested call writes then reverts, and confirm that the final state diff contains the outer writes only, and that the journal is empty after commit.",
    dep: ["contract-calls","state-cache"]
  },
  "state-cache": {
    s: "In-memory caches of recently used accounts, storage slots and tree nodes that reduce disk reads during execution and queries.",
    d: "Execution touches many accounts, and each uncached lookup walks several tree levels, each a random read. Caches hold decoded accounts, storage values and tree nodes, sized by configuration. A flat snapshot sits between the cache and the tree for direct key lookups. Caches are invalidated or layered on reorganizations so they never return values from an abandoned branch. The difficulty is correctness under forks: a cache populated while executing a side chain must not serve the canonical chain.",
    k: ["Larger cache versus smaller memory footprint: a large cache can cut import time several times over, but competes with the operating system's file cache and the rest of the node.", "Layered per-block caches versus one global cache: layers handle forks exactly by dropping a layer, but add lookup cost per layer."],
    p: ["A cache entry from an abandoned block served after a reorganization makes execution produce the wrong root.", "A cache sized larger than available memory causes swapping that is slower than no cache."],
    v: "Import the same 1,000 blocks with the cache disabled and enabled and confirm identical state roots, with the cached run reading measurably fewer database pages per block.",
    dep: ["authenticated-state-tree","flat-state-snapshot","state-database"]
  },
  "block-commitments": {
    s: "The hashes in a header that bind it to its body and results: the transaction root, the receipt root and the state root.",
    d: "Each root is the top of a hash tree over a list: transactions in the body, receipts from execution, and the full state. A header therefore commits to a block's contents and effects in a few dozen bytes. A light client that has a trusted header can check any transaction, receipt or account with a proof. Nodes compute the roots when building and compare them when validating. The challenge is that they must be computed identically by every client, including how an empty list and a single item are handled.",
    k: ["Separate roots for transactions, receipts and state versus one combined: separate roots allow proofs about one without the others, but make the header larger.", "Binary tree versus structure keyed by index: a binary tree has smaller proofs, while an indexed structure is easier to update incrementally."],
    p: ["Different handling of an empty list gives clients different roots for blocks with no transactions.", "A root computed before all block effects have been applied omits some changes."],
    v: "Build a block, recompute transaction, receipt and state roots from stored data on an independent client, and confirm all three match the header, including for an empty block.",
    dep: ["merkle-tree-library","transaction-receipts","state-root"]
  },
  "stateless-witnesses": {
    s: "A bundle of the state entries a block touches, with proofs, shipped alongside it so a node can validate the block without storing the full state.",
    d: "The producer records which accounts and slots a block reads and writes, and attaches them with proofs against the previous state root. A verifier executes the block using only this witness, checks that the proofs match the root it trusts, and computes the new root. This lets validators run without holding a large state database. The cost moves to bandwidth: witnesses can be hundreds of kilobytes to megabytes, and the state tree format must be chosen to make proofs small.",
    k: ["Stateless validation with witnesses versus full state on every node: statelessness lowers storage and sync cost for validators, but raises bandwidth and needs someone to hold and serve the state.", "Witness included in the block versus served separately: inclusion makes the block self-contained, but enlarges every block for everyone."],
    p: ["A witness that omits an entry the block reads makes execution fail or silently use a default.", "Witness sizes that grow with adversarial access patterns exceed what the network can propagate in a slot."],
    v: "Execute a block on a node that has only the witness and no state database, and confirm it computes the same post-state root as a full node with the whole state.",
    dep: ["inclusion-proofs","state-root","state-transition-function"]
  },
  "header-first-sync": {
    s: "Downloading and checking block headers from peers before bodies, so the node learns the shape of the chain and its total work or weight cheaply.",
    d: "The node asks peers for headers starting at the head it knows, in batches, and verifies each against its parent: linkage, timestamp, difficulty or proposer signature. Because headers are small, thousands arrive per request. Once a header chain with enough work or weight is known, the node schedules body downloads against it. Peers that advertise a chain whose headers fail checks are dropped. The challenge is that cheap verification of headers does not prove the bodies are valid, only that someone expended work or stake.",
    k: ["Headers first versus blocks in order: headers first lets a node reject fake chains early and parallelize body downloads, but needs memory to hold the header chain.", "Verify header signatures during download versus later: immediate verification stops cheap spam, but adds CPU load to the slowest phase."],
    p: ["Accepting a long header chain from one peer without checking total work lets that peer feed a fake low-work chain.", "Header chains that are valid but never lead to valid bodies waste disk and time."],
    v: "Sync headers from three peers where one serves a fork with a bad link, and confirm the node ends on the best valid header chain and drops that peer with a stated reason.",
    dep: ["block-format","request-response-protocols","fork-choice-rule"]
  },
  "block-download-scheduler": {
    s: "The scheduler that assigns ranges of blocks to peers, tracks what is in flight, retries slow or failing requests and hands completed blocks to validation in order.",
    d: "Downloads proceed in parallel over many peers. The scheduler splits the missing range into batches, assigns each to the peer with the best measured throughput, sets a timeout, and reassigns on failure. Completed batches wait in a buffer until their predecessors are validated. It limits the buffered amount so memory stays bounded. The hard part is balance: validation is usually the bottleneck, so over-downloading wastes memory, while under-downloading leaves the CPU idle.",
    k: ["Assign by measured peer speed versus equal shares: speed-based assignment finishes sooner, but concentrates load on a few peers and rewards peers who fake it.", "Large batches versus small: large batches amortize request overhead, while small ones allow faster recovery from a bad peer."],
    p: ["A slow peer holding the earliest missing batch stalls the entire pipeline.", "Unbounded buffering of out-of-order blocks causes memory exhaustion near the end of a sync."],
    v: "Sync a test chain from peers with mixed speeds, kill the fastest mid-way, and confirm the node finishes, with no gap in imported block numbers and memory use staying within the configured buffer.",
    dep: ["header-first-sync","request-response-protocols","peer-scoring"]
  },
  "full-sync-replay": {
    s: "Syncing by executing every block from genesis, which verifies the entire history and rebuilds the state locally with no shortcuts.",
    d: "Starting at the genesis block, the node downloads each block, validates it fully and applies its state changes. After finishing, it holds the same state as every honest node and has checked every rule. It is the most trust-minimized method and the slowest, taking days on a busy network and growing with each year of history. Execution of old blocks must use the rules in force at the time, so the client carries code for every past fork.",
    k: ["Replay all history versus start from a snapshot: replay trusts nothing but the genesis block, while snapshots are far faster and rely on a trusted checkpoint or a proof.", "Keep every historical rule version versus drop old ones: keeping them allows exact replay, but means old code paths are maintained forever."],
    p: ["Replaying old blocks with a rule from a later fork produces a different state root partway through.", "Disk throughput, not CPU, becomes the limit, and slow storage turns days into weeks."],
    v: "Sync a test chain with a known fork history from genesis and confirm the state root at each fork boundary and at the head equals the published values.",
    dep: ["block-validation","state-database","block-download-scheduler"]
  },
  "snapshot-sync": {
    s: "Downloading the full state at a recent block directly from peers, verifying it against the state root in a trusted header, then continuing from there.",
    d: "The node picks a recent pivot block, requests account and storage ranges from many peers in parallel, and checks each range with a proof against the pivot's state root. The resulting data is assembled into a local tree. While this runs, the chain advances, so the state is slightly out of date and must be repaired. Snapshot sync does not execute historical blocks, which cuts time from days to hours. What it gives up is verification of old history, relying on the root and on the chain's work or finality.",
    k: ["Trust the pivot header versus replay to check it: a recent finalized or well-worked header is secure enough for most, but a snapshot cannot detect an invalid state inside an old block.", "Serve snapshots from every node versus a few: universal serving keeps sync decentralized, but costs each node extra storage for the flat snapshot."],
    p: ["Peers serving ranges without proofs, or the node not checking them, lets a peer insert fake accounts.", "A pivot too old by the time the download ends forces the node to repair a large gap."],
    v: "Snapshot sync a test node, then compare the root of its reconstructed tree to the pivot header's state root and sample 100 random account queries against a full-sync node.",
    dep: ["state-root","inclusion-proofs","flat-state-snapshot","request-response-protocols"]
  },
  "state-healing": {
    s: "The repair pass after a snapshot download, which fetches the state nodes that changed while the download was running, until the local tree matches a current root.",
    d: "Because the pivot moves while ranges are fetched, the downloaded data comes from several different blocks. The node walks its tree from the newest root, finds subtrees whose hashes are missing or do not match, and requests exactly those nodes. Each fetched node is verified against its parent hash. The process repeats until nothing is missing. Healing is short when the chain moves slowly, but if the chain moves faster than the node can fetch, it never converges.",
    k: ["Heal by walking from the root for missing hashes versus re-download everything changed: root walking fetches only what is needed, but needs many small requests.", "Move the pivot forward during healing versus keep it fixed: fixing it keeps the target stable, while moving it keeps data fresh and risks never finishing."],
    p: ["Healing that cannot keep up with the chain's rate of change loops forever on a busy network.", "A peer that returns the wrong node for a hash is only detected if every node is hash-checked."],
    v: "After a snapshot download on a test chain producing blocks, run healing and confirm it terminates, the local root equals the head's state root and a full tree traversal finds no missing nodes.",
    dep: ["snapshot-sync","authenticated-state-tree","request-response-protocols"]
  },
  "checkpoint-sync": {
    s: "Starting a proof-of-stake node from a recent finalized checkpoint obtained from a trusted source, instead of replaying consensus history from genesis.",
    d: "The operator supplies a checkpoint hash, or the node fetches a finalized block and state from a trusted provider and checks it against the hash the operator trusts. From there it syncs forward normally and can backfill older history later. This is how a proof-of-stake node gets running in minutes. It is the practical answer to the weak subjectivity period, and its security rests on the checkpoint being genuinely from the canonical chain.",
    k: ["Obtain the checkpoint from a provider versus compute locally: providers make start-up fast, but the provider can lie, which is why the operator should cross-check several.", "Backfill history afterward versus skip it: backfilling gives complete history for serving others, but takes bandwidth and disk and is optional for a validator."],
    p: ["Trusting one provider that is on a fork leaves the node on the wrong chain with all the right-looking data.", "A checkpoint older than the withdrawal period no longer protects against long-range forgery."],
    v: "Start two nodes from checkpoints obtained from different sources and confirm they report the same finalized block root; give one a wrong hash and confirm it refuses to start.",
    dep: ["weak-subjectivity","finality-gadget","block-download-scheduler"]
  },
  "light-client-sync": {
    s: "Following the chain by headers or a rotating signing committee only, fetching proofs for the few facts the application needs rather than executing every block.",
    d: "A light client keeps a small trusted state, such as the current committee, and verifies each new header's signatures or work. When the application needs a balance or an event, it requests it from a full node with a proof against the header's root and verifies it. Storage and bandwidth are small enough for phones and embedded contracts. The challenge is trust: the client cannot check that the blocks are valid, only that enough weight signed them, and it depends on full nodes to serve it.",
    k: ["Trust the committee's signatures versus check validity itself: committee trust is cheap and fast, but accepts an invalid block if enough signers misbehave.", "Request proofs on demand versus subscribe to updates: on demand costs nothing at rest, while updates keep recent data available with a standing cost for servers."],
    p: ["A light client served only by one full node can be fed a consistent but stale view.", "A client that does not refresh its committee eventually trusts keys that have long since rotated out."],
    v: "Run a light client against a test chain for a month of epochs, query an account balance with a proof, and confirm the value matches a full node and the proof verifies against a header it signed off on.",
    dep: ["inclusion-proofs","signature-aggregation","json-rpc-server"]
  },
  "pruning-policy": {
    s: "The rules for deleting old data a node no longer needs: historical state versions, old receipts and block bodies, while keeping what it must serve or verify.",
    d: "A full node keeps the current state and recent history, enough to handle reorganizations. Older state versions, old tree nodes and sometimes old bodies are deleted. An archive node keeps everything. The policy sets how many blocks of state to retain, whether to keep bodies and receipts and how often to reclaim space. Pruning is hard to get right online because tree nodes are shared across versions, so it must delete only what no retained version references.",
    k: ["Prune aggressively versus keep deep history: aggressive pruning keeps disks small and fast, but the node cannot answer historical queries or traces.", "Offline pruning versus continuous: offline reclaims the most space with a simple procedure, but needs downtime, while continuous pruning adds background load."],
    p: ["Pruning state that a deep reorganization still needs forces a long resync.", "Deleting bodies while the network expects peers to serve them reduces the availability of history."],
    v: "Prune a test node to a depth of 128 blocks and confirm queries at block 100 behind head succeed, queries at 500 behind return a clear pruned-data error, and disk use drops accordingly.",
    dep: ["state-database","block-store","reorg-handling"]
  },
  "block-store": {
    s: "The persistent storage of block headers, bodies and receipts, organized for sequential appends and lookups by number or hash.",
    d: "Headers, bodies and receipts are stored under keys of block number and hash, so multiple blocks at one height can coexist until a fork resolves. Data is written once and rarely modified. Older, finalized data moves to append-only files for compact sequential storage. Reads are by hash from the network layer and by number from the interface. The challenge is volume: years of blocks reach terabytes on busy networks, and queries over old blocks must stay fast.",
    k: ["Key by number plus hash versus by hash only: number-and-hash keys make range scans cheap and handle forks, but need a separate canonical index.", "Compress old bodies versus store raw: compression saves substantial space, but adds CPU cost on every read."],
    p: ["A crash after writing a body but before its header leaves orphaned data that confuses lookups.", "Storing receipts and bodies in the same table makes pruning one without the other expensive."],
    v: "Import 1,000 blocks including a three-block fork, then read each block by hash and by canonical number and confirm the numbered lookups return the canonical branch only.",
    dep: ["header-and-hash-index","cold-data-archive","write-batching"]
  },
  "header-and-hash-index": {
    s: "A small index mapping block numbers to canonical hashes and hashes to numbers, which turns every number-based query into a single lookup.",
    d: "As blocks are imported, the node records the canonical hash for each height and the reverse mapping. It also keeps the total work or weight per header, and the current head pointers for latest, safe and finalized. On a reorganization the mapping is rewritten for the changed heights. Almost every interface request starts here. It must be consistent with the chain store: a mismatch means a query returns a block that is not canonical.",
    k: ["Maintain a canonical index versus search forks at query time: a maintained index makes lookups constant time, but must be rewritten atomically on reorganizations.", "Store total work or weight per header versus recompute: storing avoids a walk to genesis per comparison, but is one more derived value to keep correct."],
    p: ["An index updated before the new branch's blocks are fully stored points to missing data after a crash.", "Head pointers for safe and finalized that move backward confuse clients that cached them."],
    v: "Reorganize a node by two blocks, then query numbers and hashes for the affected heights and confirm the index returns the new branch's hashes and that both pointers agree with the head.",
    dep: ["block-store","reorg-handling","write-batching"]
  },
  "state-database": {
    s: "The persistent store of state tree nodes and contract code, optimized for random key lookups and heavy write traffic.",
    d: "State is stored as key-value pairs: each tree node by its hash, plus code by code hash. The store is typically a log-structured or B-tree key-value engine with its own cache. Each block writes thousands of small updates, and random reads dominate execution time. Old tree nodes are retained for a window to support reorganizations and historical queries. The challenge is write amplification and read latency: state size in the hundreds of gigabytes means the working set exceeds memory and disk speed sets the limit.",
    k: ["Key tree nodes by hash versus by path: hash keys deduplicate shared subtrees across versions, but scatter related nodes across the disk, while path keys keep locality and make versioning harder.", "Log-structured versus B-tree storage: log-structured writes are fast but suffer compaction stalls, while B-trees give steadier reads and slower writes."],
    p: ["Compaction stalls freeze block import for seconds under heavy write load.", "Running on a slow disk makes execution disk-bound and the node falls permanently behind."],
    v: "Import 10,000 mainnet-like blocks on an empty database and confirm throughput stays above the chain's block rate and the on-disk size matches the expected growth within a tolerance.",
    dep: ["write-batching","crash-recovery"]
  },
  "flat-state-snapshot": {
    s: "A second copy of the state as a flat table of key to value, kept alongside the tree for direct lookups without walking tree paths.",
    d: "Accounts and storage slots are stored in a single ordered table keyed by hash of the address or slot. Execution reads values directly, with one lookup rather than a walk of several tree levels. The tree is still needed to compute roots and proofs, but it is written in batches. The snapshot keeps a few layers of recent diffs in memory, merged to disk as blocks age. It speeds execution and sync serving but needs disk space and a repair path if it diverges from the tree.",
    k: ["Flat table plus tree versus tree only: the flat table cuts reads per access from many to one, but doubles state storage and adds a consistency obligation.", "Generate the snapshot in the background versus at startup: background generation avoids downtime, but leaves the node slower and unable to serve ranges until finished."],
    p: ["A flat table that disagrees with the tree after a crash returns wrong values with no error.", "Serving range queries from a snapshot that is still being generated returns incomplete data."],
    v: "Compare every flat entry with the value found by walking the tree from the head root and confirm zero differences, then restart the node mid-import and repeat.",
    dep: ["authenticated-state-tree","state-database","write-batching"]
  },
  "write-batching": {
    s: "Grouping all writes for a block into a single atomic commit so the database moves from one consistent head to the next.",
    d: "During import the node accumulates changed state nodes, new blocks, receipts, index updates and head pointers in memory. When the block is accepted, it writes them in one batch that the database makes atomic. Some data, such as intermediate tree nodes, is held in memory across several blocks and flushed periodically, because most of it is overwritten soon. The trade-off is durability: the longer data stays only in memory, the more must be recomputed after a crash.",
    k: ["Flush every block versus every N blocks: per-block flushes are crash-safe and slow, while periodic flushes reduce writes greatly and need replay after a crash.", "One batch for everything versus separate per store: one batch gives a single consistent point, but forces all data into one engine."],
    p: ["Writing head pointers before the state they reference leaves an inconsistent database after a crash.", "A very large batch exceeds the database's memory and fails at commit."],
    v: "Kill the process in the middle of a commit during 100 trials and confirm after restart that every trial's database shows either the old head with old state or the new head with new state, never a mixture.",
    dep: ["state-database","block-store"]
  },
  "cold-data-archive": {
    s: "Compact, append-only files holding finalized old blocks, moved out of the main database so it stays small and fast.",
    d: "Once a block is deep enough to be final, its header, body and receipts move from the database into sequential files, indexed by number. Compression is applied since old data is rarely touched and never changes. The main database keeps only recent data and pointers. Reads from the archive are efficient for sequential ranges and serve the network when peers request old blocks. The difficulty is the boundary: data must never be deleted from the database before it is safely in the archive.",
    k: ["Separate append-only archive versus everything in the database: the archive avoids database overhead and compaction on immutable data, but adds a second storage format.", "Move after finality versus after a fixed depth: finality makes the move safe in proof of stake, while a fixed depth is a probabilistic bet in proof of work."],
    p: ["Copying then deleting without verifying the archive write loses blocks after a crash.", "Moving data before a deep reorganization is impossible forces the node to reimport it."],
    v: "Freeze blocks older than 90,000 and confirm each is readable from the archive, byte-equal to its pre-move content, and then absent from the main database.",
    dep: ["block-store","pruning-policy"]
  },
  "crash-recovery": {
    s: "The startup procedure that finds the last consistent point after a crash, repairs or discards partial work and replays blocks to restore the head.",
    d: "On start, the node reads its head pointers, checks that the referenced block and state exist, and, if recent state was held only in memory, locates the latest persisted state root and re-executes blocks from there. It validates the archive's last entries and truncates partial writes. If the flat snapshot is behind or inconsistent, it is repaired or regenerated. Recovery is correct only if the write ordering is correct; it can only repair what the write protocol allows.",
    k: ["Replay from the last persisted state versus persist every block: replay saves write cost in normal operation, but makes recovery after a crash slower.", "Automatic repair versus refuse to start: repair keeps the node up, but silent repair can hide a corrupted disk that will fail again."],
    p: ["A crash during a long flush with replay depth above the retained blocks forces a full resync.", "Disk errors that flip bits are not detected unless hashes are checked on read."],
    v: "Kill the process with unflushed state during block import on a test chain, restart, and confirm the node logs the replay range, reaches the same head and state root as before the crash, and resumes syncing.",
    dep: ["write-batching","state-database","block-store"]
  }
});
