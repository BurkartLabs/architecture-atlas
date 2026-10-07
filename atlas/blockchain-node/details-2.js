// Details for the blockchain node plate, part 2: block production, consensus, upgrades.
ATLAS.details("blockchain-node", {
  "block-format": {
    s: "The layout of a block: a header with commitments and metadata, followed by a body of transactions, with exact rules for every field and size.",
    d: "The header holds the parent hash, a number or slot, a timestamp, commitments to the transaction list and the post-state, resource totals and, depending on the design, proof-of-work fields or proposer signatures. The body lists transactions in order. A block's identifier is the hash of its header, so changing anything changes the identity. Fields have defined ranges and relations to the parent, such as a timestamp strictly after it. The difficulty is that header fields are consensus-critical and changed only by hard forks.",
    k: ["Small fixed header with commitments versus a header carrying data: a small header lets light clients download many cheaply, but anything else needs a separate proof.", "Hash the header only versus hash the whole block: header-only identity lets nodes exchange headers and verify them without bodies, at the cost of a separate commitment tying body to header."],
    p: ["A timestamp rule that is too loose lets producers shift time to manipulate difficulty or time-locked contracts.", "Not bounding the body size independently of the header lets a block be valid in structure and impossible to propagate."],
    v: "Build a block, change one transaction byte, and confirm the transaction commitment in the header no longer matches and the block hash changes, so independent nodes reject it.",
    dep: ["canonical-serialization","hash-functions","block-commitments"]
  },
  "block-assembly": {
    s: "Building a candidate block: choosing a parent, filling it with transactions, executing them, and computing the resulting commitments for the header.",
    d: "The producer takes the head as parent, picks transactions, executes each against a working copy of the state, and stops at the resource limit. After execution it computes the state root, receipts commitment and totals, and writes them into the header. Building and validating share the same execution code. Assembly must be fast: a late block misses its slot in proof of stake, or loses the race in proof of work. The challenge is balancing fee revenue against how long the block takes to build.",
    k: ["Rebuild the block repeatedly as better transactions arrive versus build once: rebuilding captures more fees, but burns CPU and delays publication if the last pass runs late.", "Build in the node versus delegate to an external builder: delegation can find more revenue, but moves a critical task to a party the node must trust to deliver."],
    p: ["Executing transactions in a different order than the header commits to produces a block that every other node rejects.", "A block that is full of valid but slow transactions cannot be built before the deadline."],
    v: "Assemble a block from a pool of 500 transactions and confirm another node, executing the block independently, arrives at the same state root and receipt commitment recorded in the header.",
    dep: ["transaction-selection","state-transition-function","block-format","state-root"]
  },
  "transaction-selection": {
    s: "Choosing which pending transactions go into the next block, trading fee revenue against the resource limit and dependencies among transactions.",
    d: "Selection walks the pool in fee order, skips anything that cannot execute against the evolving state, and stops when the resource limit is reached. This is a knapsack problem with ordering constraints, solved greedily. Producers also consider transactions that conflict, bundles that pay conditionally and rules about size. Selection is policy, not consensus: any order of valid transactions is a valid block. That freedom lets producers extract extra value from ordering, which is the root of a number of fairness concerns.",
    k: ["Greedy by fee versus optimizing the whole block: greedy is fast and nearly optimal for typical blocks, but leaves value on the table when large transactions block smaller ones.", "Free ordering versus a protocol-enforced ordering rule: free ordering maximizes producer flexibility, while enforced rules reduce front-running at the cost of throughput or complexity."],
    p: ["Selecting a transaction that fails during block execution wastes space and may invalidate the block under strict rules.", "Ordering driven only by fees lets a producer reorder users' trades to take profit from them."],
    v: "Offer the selector a pool of mixed fees and sizes with a known limit and confirm the chosen set fits the limit, preserves each sender's nonce order, and includes the highest-paying executable transactions.",
    dep: ["mempool-ordering","fee-market","block-assembly"]
  },
  "proposer-selection": {
    s: "The rule that decides which participant may produce the block for a given slot, by a lottery over stake or by whoever solves the puzzle first.",
    d: "In proof of stake, a deterministic function of the validator set and shared randomness picks a proposer for each slot, and everyone can compute who it should be. Only that proposer's block is accepted for the slot. In proof of work, there is no schedule: anyone may propose, and the chain with the most accumulated work wins. Selection must be unpredictable far ahead, so attackers cannot target upcoming proposers, yet verifiable afterward by every node.",
    k: ["Schedule known one epoch ahead versus unpredictable until the slot: a known schedule helps preparation and lookahead, but exposes proposers to targeted attacks.", "Weight selection by stake versus equal chances per participant: stake weighting aligns power with economic cost, but concentrates selection among large holders."],
    p: ["Randomness that a producer can bias lets them grind for a favorable schedule.", "A node with a wrong view of the validator set computes the wrong proposer and rejects valid blocks."],
    v: "On a test network with a known validator set and seed, compute the proposer for the next 32 slots on two independent nodes and confirm both sequences match and each block is signed by the expected key.",
    dep: ["validator-set","system-clock"]
  },
  "proof-of-work-search": {
    s: "The search for a header whose hash falls below a target, which makes block production costly and ties the right to publish to expended computation.",
    d: "The miner builds a header, then varies a counter and extra fields, hashing each variant until one meets the target. The work is embarrassingly parallel, so it runs on many cores or dedicated hardware. A found block is broadcast immediately. When a new block arrives, the miner abandons its search and restarts on the new head. Checking a solution takes one hash. The challenge for a node is mostly external: pool coordination, fast switching to new work, and keeping hardware efficient.",
    k: ["Memory-hard versus compute-bound puzzle: memory-hard puzzles narrow the advantage of specialized hardware, but verification is costlier and the gap tends to reopen over time.", "Solo mining versus pooled work: pools smooth income for small participants, and concentrate block-building decisions in the pool operator."],
    p: ["A miner that keeps working on a stale parent wastes all that work after a competitor's block arrives.", "A puzzle with no resistance to hardware specialization concentrates production among a few manufacturers."],
    v: "Set a low target on a test network, mine a block, and confirm that hashing its header on a separate verifier yields a value below the target and that changing the counter makes it fail.",
    dep: ["hash-functions","block-format","difficulty-adjustment"]
  },
  "validator-duties": {
    s: "The scheduled jobs of a staking participant: propose blocks when selected, vote on the head and on checkpoints, and join committees that aggregate votes.",
    d: "Each epoch the validator learns its duties: which slot it proposes in, which committee it votes with and when. At its slot it fetches the head, creates the vote, signs it through the slashing guard and publishes it to the committee topic. Aggregators combine votes into one signature. Missed duties reduce rewards. The hard part is timing: duties fall within a few seconds of the slot start, so clock error, network delay or a slow execution step can cause a miss.",
    k: ["Vote on what the node sees at the deadline versus wait for a better view: waiting reduces forks but risks missing the deadline when the proposer is late.", "Run duties on the main node versus a separate validator client: separation allows restarts and failover of one without the other, at the cost of an extra interface and another failure point."],
    p: ["A validator whose clock drifts by a second consistently votes for the wrong slot.", "Voting for a head built on an invalid execution result gets the validator penalized or off the canonical chain."],
    v: "Run a validator for one epoch on a test network and confirm from chain data that it proposed in each slot assigned to it and that its votes were included within the expected number of slots.",
    dep: ["voting-and-attestations","proposer-selection","slashing-protection","system-clock"]
  },
  "block-validation": {
    s: "The complete check of a received block: header rules, consensus proof, every transaction executed, and the resulting commitments matched against the header.",
    d: "The node verifies the header against its parent, checks the proof of work or proposer signature, verifies the transaction commitment, executes every transaction in order against the parent state, and compares the computed state root, receipt commitment and resource totals to the header. Any mismatch means the block is invalid and its descendants are too. Validation is the heart of trustless operation: the node accepts nothing on the word of the producer. It is costly, so nodes check cheap header rules first.",
    k: ["Fully execute every block versus trust a recent checkpoint: full execution proves everything, but is the slowest part of syncing and the reason for many shortcuts.", "Cache a result computed during mempool admission versus recompute: caching saves time, but a bug in the cache key lets an invalid block through."],
    p: ["Skipping a check that is rarely violated means that on the day someone violates it, the node follows a bad chain.", "Treating an invalid block as a reason to ban its sender punishes honest peers who relayed it before they could check."],
    v: "Feed the node a block with correct structure but one wrong value in the state root, and confirm it is rejected after execution with a root mismatch and the head does not move.",
    dep: ["state-transition-function","block-format","state-root","fork-choice-rule"]
  },
  "block-rewards": {
    s: "The issuance and fee rules that pay producers and voters, set by the protocol, and enforced by every node when it validates a block.",
    d: "Each block can create new units of the native asset for the producer, with an amount defined by a schedule that may halve over time or follow a formula. Fees collected from transactions are added, and part may be burned. In proof of stake, voters also earn per-duty rewards, and absent or misbehaving ones pay penalties. Validation recomputes expected balances from these rules. The difficulty is that the rules are an economic design embedded in code: small errors change supply or security.",
    k: ["Fixed issuance schedule versus formula based on participation: a schedule is predictable, while a formula adapts security spending to the amount staked, and is harder to reason about.", "Pay at block time versus lock for a maturity period: maturity guards against rewards from a block that is later reorganized away, but adds bookkeeping to the state."],
    p: ["A rounding error in reward calculation differs between implementations and splits the network.", "Rewards that favor large participants gradually concentrate control."],
    v: "Execute the first block after a scheduled reduction on a test network and confirm the producer's balance increases by exactly the new amount plus fees, matching the protocol specification.",
    dep: ["fee-market","protocol-parameters","state-transition-function"]
  },
  "fork-choice-rule": {
    s: "The rule that picks the canonical head among competing valid chains, by most accumulated work or by most weight of votes from validators.",
    d: "The node keeps a tree of all valid blocks it has seen. The rule picks one leaf as head: the chain with the most cumulative work, or, in proof of stake, the subtree with the most recent validator votes, never crossing a finalized block. The rule runs on every new block or vote, so it must be incremental. The head is what the node builds on and what the interface reports as latest. The difficulty is that the rule is a security property: attackers aim to exploit it with private chains or timed releases.",
    k: ["Longest or heaviest chain versus vote-weighted subtree: work-based rules need no identity, while vote-based rules converge faster but depend on timely, honest messages.", "Prefer first-seen on ties versus break ties by hash: first-seen is simple but varies per node, and a hash-based tie-break gives all nodes the same answer."],
    p: ["A rule that can be influenced by withholding and then releasing blocks lets an attacker repeatedly reorder recent history.", "Computing the head from scratch on every vote makes a busy network slower than real time."],
    v: "Create two competing branches on a test network, deliver the heavier one second, and confirm the node switches its reported head to it, and switches back only if the other gains more weight.",
    dep: ["block-validation","voting-and-attestations","finality-gadget"]
  },
  "reorg-handling": {
    s: "The procedure for switching to a different canonical chain: undoing the abandoned blocks, applying the new ones and fixing up everything derived from them.",
    d: "When the fork-choice rule picks a new head on another branch, the node finds the common ancestor, rolls the state back to it, and executes the blocks of the new branch. Derived data must follow: pool contents, log indexes, transaction lookups and subscriptions. Transactions in abandoned blocks go back to the pool. Shallow reorganizations are routine in some networks. The challenge is cost and correctness: rolling back needs old state or an undo journal, and any derived index that is missed leaves the node inconsistent.",
    k: ["Keep recent state diffs for rollback versus recompute from older state: diffs make shallow reorganizations quick, but need disk and a depth limit beyond which the node must replay.", "Update indexes in the same atomic write as the head versus afterward: atomic updates keep views consistent, but widen the write and slow import."],
    p: ["Reporting events from an abandoned block to clients without a removal notice leaves applications with false history.", "A reorganization deeper than retained state forces a long replay while the node serves stale data."],
    v: "Reorganize a test node by three blocks and confirm the state root, transaction index, log index and balance queries all match a freshly synced node, and removed transactions return to the pool.",
    dep: ["fork-choice-rule","state-journal","mempool-eviction","header-and-hash-index"]
  },
  "difficulty-adjustment": {
    s: "A proof-of-work rule that retunes the target after a fixed number of blocks, so blocks arrive at a steady interval as total computing power rises and falls.",
    d: "The protocol measures how long the last window of blocks took against the goal and scales the target proportionally, within a clamp per adjustment. Some designs adjust every block using a moving average. All nodes compute it from header timestamps, so it is consensus-critical and depends on timestamps being honest within bounds. The risks are at the edges: if power drops suddenly, blocks come very slowly until the next adjustment, and timestamp manipulation can bias the result.",
    k: ["Adjust per window versus every block: windows are simple and resist noise, but respond slowly to sudden power changes, while per-block adjustment tracks quickly and is easier to manipulate.", "Clamp the change per step versus allow any change: clamping blocks extreme swings, but makes recovery from a collapse take many windows."],
    p: ["A large miner switching away leaves blocks arriving far apart until the next adjustment.", "Timestamps accepted too far in the future let miners lower difficulty artificially."],
    v: "Simulate a window mined in half the target time and confirm the next target is lowered by the factor the rules specify, capped by the clamp, and identical across two implementations.",
    dep: ["proof-of-work-search","block-format","protocol-parameters"]
  },
  "validator-set": {
    s: "The registry of staked participants with their weights and status, updated by deposits, exits and penalties, and used to pick proposers and committees.",
    d: "The set lives in consensus state. Joining requires a deposit processed by the protocol; leaving goes through a queue to prevent mass exits. Each validator has a balance, an activation epoch and a status, and the set changes only at epoch boundaries so every node agrees on membership for the whole epoch. Per-epoch processing computes rewards and penalties for all validators, which is expensive for hundreds of thousands of entries. The difficulty is keeping churn bounded: fast changes weaken security guarantees, slow ones frustrate users.",
    k: ["Limit entries and exits per epoch versus admit all immediately: limits protect finality assumptions from sudden shifts, but create waiting lines that can stretch to days.", "Cap each validator's weight versus allow any amount: caps keep message volume per participant uniform, but force large holders to run many identities."],
    p: ["Processing the whole set at each epoch boundary causes a visible stall in block import.", "A node with a stale copy of the set mistakes valid votes for invalid ones."],
    v: "Submit a deposit on a test network and confirm the validator appears with the activation epoch dictated by the queue, and is eligible for duties only from that epoch onward.",
    dep: ["state-transition-function","slashing-conditions","account-records"]
  },
  "voting-and-attestations": {
    s: "Signed votes from validators for the current head and for checkpoints, gathered into committees and aggregated, which drive both fork choice and finality.",
    d: "Each validator votes once per epoch, in a slot assigned by committee. A vote names the head block and a source and target checkpoint, and is signed. Votes are broadcast on committee topics, aggregated into a single signature per committee, and included in later blocks as evidence. Fork choice reads recent votes; the finality gadget reads checkpoint votes. The challenge is volume: hundreds of thousands of votes per epoch must be received, verified, aggregated and stored without overwhelming nodes.",
    k: ["Committees that each vote on a subset of slots versus every validator every slot: committees spread message load, but weaken the weight of votes available in any single slot.", "Aggregate votes into one signature versus carry individual ones: aggregation shrinks blocks and verification, at the cost of more complex bookkeeping for who voted."],
    p: ["Votes included too late earn no reward and fail to influence fork choice.", "A vote for a block the node has not yet seen must be held rather than dropped, or honest votes are lost to normal delay."],
    v: "On a test network, confirm that in each epoch the number of distinct validators represented in included votes equals the active set size, and that each aggregate signature verifies.",
    dep: ["signature-aggregation","validator-set","gossip-mesh"]
  },
  "finality-gadget": {
    s: "A protocol layer that marks blocks as final once enough stake has voted for them in two linked rounds, so they cannot be reverted without destroying a large fraction of stake.",
    d: "Checkpoints at epoch boundaries are voted on. A checkpoint is justified when more than two thirds of stake votes for it, and finalized when the next one is justified on top of it. The node tracks justified and finalized checkpoints from votes in blocks, and the fork-choice rule never reverts past finality. Finality gives a clear answer to exchanges and bridges. The cost is liveness: if a third of validators go offline, finality halts while blocks continue.",
    k: ["Probabilistic confirmation depth versus explicit finality: depth needs no extra messages but never reaches certainty, while explicit finality gives a hard point at the price of extra voting and a stall condition.", "Finalize quickly with few rounds versus slowly with more: fewer rounds shorten wait, but need more stake online and more network synchrony."],
    p: ["Treating justified as finalized lets an application act before the second round completes.", "A prolonged finality stall leaves the node storing unfinalized state it can never prune."],
    v: "Take a third of test validators offline and confirm blocks keep being produced while the finalized checkpoint stops advancing; bring them back and confirm finality resumes with a single epoch gap.",
    dep: ["voting-and-attestations","validator-set","fork-choice-rule"]
  },
  "slashing-conditions": {
    s: "Rules that define provably contradictory signatures, such as two blocks in one slot or conflicting votes, which destroy part of a validator's stake when proven.",
    d: "Anyone who observes two signed messages that together violate a rule can submit them as evidence in a block. The protocol verifies the signatures and the contradiction, then reduces the offender's balance and forces an exit, with a larger penalty when many validators are punished in the same window. The conditions are chosen so honest validators following the protocol never meet them. The challenge is that the penalty is severe and permanent, so the conditions must be exactly right, and a client bug that signs twice is punished identically to an attack.",
    k: ["Penalty scaled by simultaneous offenders versus a flat penalty: scaling punishes coordinated attacks heavily and spares isolated accidents, but makes the cost of a rule depend on others' behavior.", "Evidence includable by anyone versus only by the validator's peers: open evidence ensures enforcement, but requires nodes to watch and store messages for a long window."],
    p: ["Running the same keys on two machines for failover is the most common cause of accidental penalties.", "Evidence window shorter than the time it takes to detect lets a conflicting signature go unpunished."],
    v: "On a test network, sign two different blocks for one slot with a test key, submit them as evidence, and confirm the next block reduces that validator's balance and sets its exit status.",
    dep: ["digital-signatures","validator-set","voting-and-attestations"]
  },
  "weak-subjectivity": {
    s: "The need for a node that has been offline longer than the stake withdrawal period to start from a recent trusted checkpoint rather than from genesis alone.",
    d: "In proof of stake, old validators who have withdrawn their stake can no longer be punished, so they could sign an alternative history from long ago at no cost. A node that syncs from genesis cannot distinguish that fake from the real chain. The defense is a checkpoint hash obtained from a source outside the protocol, valid for a period determined by the withdrawal delay. This is a real change in trust model compared with proof of work, where the heaviest chain from genesis can be verified without extra information.",
    k: ["Require a recent checkpoint versus sync from genesis only: checkpoints prevent long-range forgery, but add a small out-of-band trust step that proof of work does not have.", "Long withdrawal delay versus short: longer delays extend the safe offline period, but lock stakers' funds for longer."],
    p: ["Syncing from a stale checkpoint obtained from a single untrusted source follows an attacker's chain.", "Operators who stop a node for months and restart it without refreshing the checkpoint may follow a fake history."],
    v: "Start a node with a checkpoint hash from a known fork and confirm it refuses to sync a chain that conflicts with it, reporting the mismatch instead of switching.",
    dep: ["checkpoint-sync","finality-gadget","validator-set"]
  },
  "consensus-execution-interface": {
    s: "The local interface between the part of the node that follows consensus and the part that executes transactions, in designs that split the two into separate programs.",
    d: "The consensus component decides which block is canonical and tells the execution component to import it, build one, or update the head and finalized markers. Calls carry the block payload, the fork-choice state and attributes for building. The execution side validates the payload and returns a status: valid, invalid or syncing. The boundary lets each part be swapped independently and enables client diversity on both sides. It is hard because the two share fate: the pair must handle restarts and lag without disagreeing about the head.",
    k: ["Split into two programs versus a single monolith: splitting allows mixing implementations and independent upgrades, but adds an authenticated local interface and doubles the failure modes.", "Execution reports syncing versus blocking until ready: reporting lets consensus continue gracefully, but means it must cope with a head it cannot yet confirm."],
    p: ["Execution marks a payload invalid without an explanation, leaving the consensus side unable to tell a bug from an attack.", "A shared secret for the local channel left unset lets other local processes control the head."],
    v: "Send a payload with a wrong state root across the interface and confirm execution returns invalid with the latest valid ancestor, and the consensus side does not adopt that block as head.",
    dep: ["block-validation","fork-choice-rule","state-transition-function"]
  },
  "protocol-parameters": {
    s: "The constants and formulas that define the chain's rules, such as block size or resource limits, slot time, issuance amounts and fee adjustment bounds.",
    d: "Parameters live in a chain specification shared by all nodes and are identified by the network name. Some are fixed forever, others change at upgrade heights. A parameter with a fork schedule has a lookup by block number or time. Code reads parameters through one table so that a rule's value at a given block is unambiguous. They are consensus-critical: a node with one wrong constant follows its own chain. The challenge is that parameters interact, so changing one without testing the others shifts security or cost.",
    k: ["Parameters in a data file versus compiled into code: a file makes test networks easy to create, but makes it easier to start with a mismatched specification.", "Dynamic parameters set by on-chain governance versus changed only by upgrades: on-chain updates avoid coordinated software releases, but add a governance attack surface."],
    p: ["A test-network specification accidentally shipped to production nodes starts a separate chain.", "A limit that can be raised only by a hard fork becomes a constraint no one wants to revisit."],
    v: "Load the specification on two independent clients and confirm that for blocks on either side of every scheduled change, each reports identical values for every parameter.",
    dep: []
  },
  "fork-activation-rules": {
    s: "The conditions, by block height, timestamp or signaling, under which a new set of rules takes effect, so every node switches at the same block.",
    d: "Each upgrade is named and gets an activation point written into the chain specification and the software release. Before the point, nodes apply old rules; at and after it, new ones. Activation by height is deterministic; by timestamp it works for chains where height is unevenly spaced. Nodes also check that peers advertise the same fork identifier, so a node on the old rules disconnects from the upgraded network instead of feeding it blocks. The challenge is that upgrade readiness is not observable, and a late operator silently follows the old chain.",
    k: ["Activation at a fixed height or time versus after a signaling threshold: fixed points are predictable, but go ahead regardless of readiness, while signaling waits for evidence at the cost of uncertainty about when.", "Advertise fork identifiers in the handshake versus ignore: identifiers detect incompatible peers early, but add a rule that must be updated with every fork."],
    p: ["Operators who miss the release keep running and produce blocks on a minority chain.", "An activation time set too close to release leaves no time for slow-updating infrastructure."],
    v: "On a test network with the fork scheduled at a known block, run one upgraded and one old node and confirm the old node stops syncing at that block while the upgraded one follows the new rules.",
    dep: ["protocol-parameters","handshake-and-encryption","block-validation"]
  },
  "soft-fork-signaling": {
    s: "A way to tighten rules in a backward-compatible way, where producers signal readiness in block headers and the rule activates after a threshold share signals.",
    d: "A soft fork makes some previously valid blocks invalid without making any new block valid under old rules, so old nodes still follow the chain as long as the upgraded majority enforces it. Producers set a bit in the header during a signaling window. If enough blocks in a period signal, the rule locks in and then activates after a delay. The difficulty is that non-upgraded nodes do not enforce the new rule, so they accept blocks that upgraded nodes reject, and their view of the chain can diverge if the majority is not honest.",
    k: ["Signal by producers versus activate by users: producer signaling lets the majority of work decide, while user-activated deadlines let node operators force the change regardless of producers.", "Soft fork versus hard fork for a change: soft forks keep old nodes working, but they restrict what changes are possible and old nodes trust the majority."],
    p: ["Old nodes treat a block that violates the new rule as valid, so they can be shown transactions that upgraded nodes would reject.", "Signaling that stalls just below the threshold leaves the network in an uncertain state for weeks."],
    v: "Run a test chain where 95 percent of blocks signal, and confirm the rule locks in after the window and starts rejecting a violating block that an old node would have accepted.",
    dep: ["fork-activation-rules","block-format","block-validation"]
  },
  "upgrade-coordination": {
    s: "The social and technical process by which node operators, client teams and applications agree on a change, test it on test networks and schedule it for the main network.",
    d: "Changes are written as proposals, discussed in public, specified precisely and implemented by every client team. They run on short-lived test networks and a longer-lived public test network before a main-network date is set. Release notes name the activation point and the clients that include it. The protocol itself has no enforcement of any of this: nobody can force operators to upgrade. The difficulty is the number of independent parties that must act within a window, and the long tail that does not.",
    k: ["Rough consensus among client teams versus a central maintainer's decision: broad agreement increases legitimacy and catches mistakes, but is slow and can stall on contentious changes.", "Frequent small upgrades versus rare large ones: small upgrades reduce risk in each, but demand constant attention from operators."],
    p: ["A change that passes one client's tests but is specified ambiguously is implemented differently by another and splits the network at activation.", "Announcing an activation date before all clients have released leaves operators unable to comply."],
    v: "Before a scheduled upgrade, run every major client on a public test network through the activation and confirm all report the same head and state root a day afterward.",
    dep: ["fork-activation-rules","consensus-test-vectors","client-diversity"]
  },
  "consensus-test-vectors": {
    s: "A shared library of inputs and expected outputs for every consensus rule, run against each client to catch disagreements before they reach the network.",
    d: "Vectors cover transactions, signatures, state transitions, block validation, fork choice and serialization. Each is a data file with a starting state, an input and the exact expected result, including expected failures. Client teams run them on each commit, and fuzzers generate differential inputs to compare implementations against one another. Vectors are the executable form of the specification, and where prose is ambiguous, the vectors settle it. The hard part is coverage: every historical bug and edge case must become a vector.",
    k: ["Fixed vectors versus differential fuzzing across clients: fixed vectors are reproducible and easy to share, but differential fuzzing finds unknown disagreements and needs several implementations to compare.", "Vectors in neutral data format versus per-client tests: neutral files can be used by any client, but require every client to build a loader."],
    p: ["A vector that tests only the valid path lets an implementation that accepts invalid input pass.", "Vectors that depend on one client's internal behavior get a rule wrong for the whole network."],
    v: "Run the full vector suite against two independent clients and confirm every case yields identical pass, fail and resulting state roots, and that a deliberately broken client fails at least one vector.",
    dep: ["state-transition-function","block-validation","canonical-serialization"]
  }
});
