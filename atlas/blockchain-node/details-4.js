// Details for the blockchain node plate, part 4: network, cryptography, cross-cutting concerns.
ATLAS.details("blockchain-node", {
  "peer-discovery": {
    s: "Finding other nodes without a central directory, using a distributed table of node records seeded by a few well-known bootstrap addresses.",
    d: "A new node contacts bootstrap nodes and asks for records near random targets in a key space. Each reply gives more records, and repeated queries fill a routing table organized by distance. Records are checked by pinging the node. The result is a stream of candidate peers, filtered by fork identifier and capabilities. The challenge is that the table is open to anyone: attackers can flood it with identities they control, and a node that depends on bootstrap addresses alone is exposed if those are compromised.",
    k: ["Distance-based lookups in a shared table versus gossip of peer lists: lookups find any node efficiently and resist some manipulation, while gossip is simpler but spreads attacker addresses as quickly as honest ones.", "Hard-coded bootstrap list versus operator-supplied: hard-coded lists work out of the box, but concentrate trust in a few addresses and go stale."],
    p: ["Filling the table with identities that share one network location lets an attacker dominate the candidate list.", "Bootstrap addresses that go offline leave new nodes unable to join."],
    v: "Start a fresh node with one bootstrap address on a test network of 50 nodes and confirm within a minute it holds at least the configured minimum number of verified, distinct peers.",
    dep: ["node-identity-records","request-response-protocols","eclipse-defenses"]
  },
  "node-identity-records": {
    s: "A signed, versioned record that a node publishes to describe itself: its public key, network addresses, protocol versions and fork identifier.",
    d: "Each node has a long-term key. It signs a record with its current addresses and capabilities and a sequence number. Peers store the record with the highest sequence number and verify the signature. The record lets a node tell others which fork it follows, so incompatible nodes are skipped before a connection is made. Records are small and can be shared in text form. The hard part is freshness: a record that is out of date points to an address that is no longer reachable.",
    k: ["Self-signed records with sequence numbers versus unauthenticated address lists: signed records prevent forging another node's entry, but cannot prove the address is actually reachable.", "Include fork and capability fields versus negotiate after connecting: advertising saves wasted connections, and makes records change at every upgrade."],
    p: ["A node that reuses a key across machines publishes conflicting addresses that overwrite one another.", "A record with an unbounded size field is a memory exhaustion tool."],
    v: "Publish a record, change the address and sequence number, and confirm peers replace the old entry; re-send the old record and confirm it is rejected as stale.",
    dep: ["digital-signatures","canonical-serialization"]
  },
  "handshake-and-encryption": {
    s: "The exchange that authenticates the remote node, agrees on keys for an encrypted channel and checks protocol and network compatibility.",
    d: "Two nodes run a key exchange using their long-term keys, derive session keys and then send each other a status message naming network identifier, genesis, fork identifier and head. If any of these mismatch, the connection is closed. After success, all messages are framed, encrypted and authenticated. The handshake bounds how much work an unauthenticated peer can make a node do before it proves itself. The challenge is that nothing here proves the peer is honest, only that it is who it says it is.",
    k: ["Encrypt everything versus plaintext with signatures: encryption hides traffic content from passive observers and costs CPU, while signatures alone are cheaper and leave traffic readable.", "Check network and fork at handshake versus later: early checks keep incompatible peers out of the table, but need a tight match rule that does not reject honest peers mid-upgrade."],
    p: ["Accepting connections before completing the handshake lets many half-open connections exhaust sockets.", "A handshake that reveals the node's identity to anyone who connects allows targeted attacks on known validators."],
    v: "Connect a peer with a wrong network identifier and a peer with the right one, and confirm the first is disconnected during the handshake with a mismatch reason and the second completes it.",
    dep: ["digital-signatures","node-identity-records","fork-activation-rules"]
  },
  "connection-manager": {
    s: "Maintains the node's set of live peers within limits on inbound and outbound connections, dials new peers and drops poor ones.",
    d: "The manager targets a number of outbound connections, which it chooses to dial, and caps inbound ones that others open. It diversifies by network range and by role where known, protects a few long-lived peers from eviction, and replaces any peer that disconnects or scores badly. Dialing uses candidates from discovery with backoff after failures. The tension is between stability and diversity: keeping old, reliable peers is good, but keeping only those makes the node easy to eclipse.",
    k: ["Prefer outbound connections versus accept many inbound: outbound ones are chosen by the node and are harder for an attacker to control, while inbound ones help the network but can be flooded.", "Evict the lowest-scoring peer when full versus refuse new connections: eviction lets better peers in, but lets an attacker churn the table."],
    p: ["Allowing all peers to come from one address range lets a single operator control the node's view.", "Dial storms after a network outage create thousands of simultaneous connection attempts."],
    v: "Start a node with 25 outbound and 50 inbound limits and confirm from its peer list that it holds those counts, spreads outbound peers over distinct address ranges and replaces a killed peer within the dial interval.",
    dep: ["peer-discovery","peer-scoring","eclipse-defenses"]
  },
  "peer-scoring": {
    s: "A running reputation for each peer that rewards useful messages and penalizes invalid, late or spammy ones, deciding who is forwarded to and who is disconnected.",
    d: "Every message a peer sends adjusts its score: valid first-seen blocks and votes add, invalid data subtracts heavily, and duplicates or slow replies subtract a little. Scores decay over time. Below a threshold the node stops forwarding to the peer, and below a lower one it bans it for a period. Scoring turns a network where anyone can lie into one where lying costs a connection. The hard part is tuning, since honest peers occasionally relay bad messages that they could not check.",
    k: ["Heavy penalty for provably invalid data versus uniform penalties: heavy penalties remove attackers quickly, but a bug that mislabels valid data bans honest peers.", "Local scoring only versus sharing reputation: local scoring cannot be gamed through others, but every node must learn about bad peers on its own."],
    p: ["Scores that decay too slowly leave a node ban honest peers for a single transient failure.", "A rule that bans on late messages punishes peers on slow links."],
    v: "Have one test peer send 100 invalid blocks and another send 100 valid ones, and confirm the first reaches the ban threshold and is disconnected while the second's score rises.",
    dep: ["block-validation","intrinsic-validity-checks"]
  },
  "gossip-mesh": {
    s: "Topic-based publish-subscribe over the peer graph: each node keeps a small mesh of peers per topic and forwards new messages to them.",
    d: "Nodes subscribe to topics for blocks, votes, aggregates and transactions. For each, a node keeps a handful of mesh peers to which it forwards every new message in full, and additionally sends recent message hashes to others so they can request what they missed. Messages are checked before forwarding and are identified by a hash so duplicates are dropped. A message spreads in a few hops. The difficulty is the trade-off between redundancy, which gives resilience and speed, and bandwidth, and the need to validate before relaying.",
    k: ["Small mesh with hash gossip to others versus flooding to all peers: the mesh uses far less bandwidth and fails gracefully, while flooding is faster and wastes bandwidth that grows with peer count.", "Validate fully before forwarding versus forward then validate: validating first stops attackers from using the node as an amplifier, but adds latency per hop."],
    p: ["Forwarding unvalidated messages turns the node into a relay for spam.", "A topic with too few subscribers fails to propagate, and nobody sees the failure until a duty is missed."],
    v: "Publish a message from one node in a 200-node test network and confirm all subscribers receive it within the configured number of hops, and each receives the full message no more than a small constant number of times.",
    dep: ["peer-scoring","connection-manager","canonical-serialization"]
  },
  "block-announcement": {
    s: "How a newly produced or received block spreads: send the full block to a few peers and its hash to the rest, who request it if they lack it.",
    d: "On import, a node pushes the complete block to a small fraction of peers, which can validate it at once, and announces only the hash and number to the others. A peer that has not seen the hash requests the body. Nodes may forward a block after checking only its header and proof, before executing it, to cut latency. Speed matters: a block that spreads slowly is more likely to be orphaned, which favors well-connected producers. The balance is between latency and the risk of relaying something invalid.",
    k: ["Forward after header checks versus after full execution: header-only forwarding gains hundreds of milliseconds, but relays blocks that later turn out invalid.", "Compact block with transaction hashes versus full block: compact forms save bandwidth since peers already hold most transactions, but fail and fall back when the receiver misses some."],
    p: ["Waiting for full validation of every block before relaying raises the orphan rate for producers.", "Announcing a block the node has not yet stored makes it unable to answer a request."],
    v: "Produce a block on one test node and measure that it reaches the farthest of 100 nodes within the target propagation time, and that peers who received only a hash request it exactly once.",
    dep: ["gossip-mesh","block-validation","request-response-protocols"]
  },
  "request-response-protocols": {
    s: "Direct queries between two peers for headers, bodies, receipts, state ranges or specific objects, used when a node needs data rather than a broadcast.",
    d: "Each message type has a request format with limits on count and size, and a response with the data, optionally with a proof. A peer must answer within a timeout or be penalized. Servers cap work per request and per peer, since answering a request costs disk reads. Protocol versions are negotiated at handshake. This is the channel that sync, backfill and light clients rely on. The challenge is protecting the server: requests are cheap to send and costly to serve, and a node serves unknown peers all day.",
    k: ["Limit response size and request rate per peer versus serve whatever is asked: limits protect the server, but slow legitimate syncing nodes that need bulk data.", "Responses with proofs versus bare data: proofs let the requester verify without trust, and make responses larger and more costly to build."],
    p: ["A node serving large ranges to unknown peers saturates its disk and falls behind the chain.", "A requester that does not verify responses accepts forged data from a hostile peer."],
    v: "Send a request that exceeds the size limit and one within it, and confirm the first is refused with a limit error and the second returns the data with a proof that verifies.",
    dep: ["handshake-and-encryption","peer-scoring","canonical-serialization"]
  },
  "eclipse-defenses": {
    s: "Measures that stop an attacker from surrounding a node with its own peers and showing it a false view of the chain.",
    d: "An eclipsed node sees only attacker-controlled peers, so it can be fed a fork, withheld blocks or delayed transactions. Defenses include diversity limits on peers from the same address range, random selection of outbound peers from a large pool, long-lived anchor connections kept across restarts, and storing the peer table on disk. Operators also check the head against an independent source. Defenses reduce the risk but cannot remove it, because a node has no way to know that all its peers are connected to each other.",
    k: ["Persist anchor peers across restarts versus fresh start each time: anchors survive an attack at boot, but become a fixed target that an attacker can learn.", "Limit peers per address range versus accept any: limits make filling slots costly, but harm nodes in networks where many honest nodes share a range."],
    p: ["Restarting after a long outage with a table full of attacker records is the moment a node is most exposed.", "A node that never compares its head with any outside source cannot notice that it has been isolated."],
    v: "Seed a test node's table with 100 candidates from one address range and 5 from distinct ranges, and confirm its outbound connections include peers from at least the configured number of distinct ranges.",
    dep: ["peer-discovery","connection-manager","peer-scoring"]
  },
  "hash-functions": {
    s: "Collision-resistant functions used everywhere: block identity, transaction identity, tree nodes, address derivation and the proof-of-work puzzle.",
    d: "A node uses one or more standard hash functions to turn any data into a fixed-length digest. The choice is fixed by the protocol: a different function gives different identifiers, so changing it is a hard fork. Hashing is a hot path, performed millions of times per block, so implementations use optimized and hardware-assisted code. Beyond security, a few properties matter in practice: speed, resistance to length extension where relevant, and, for proof of work, how well the function resists specialized hardware.",
    k: ["Use a widely analyzed standard function versus a purpose-built one: standard ones have decades of scrutiny and fast implementations, while purpose-built ones can serve specific goals like memory-hardness and have less review.", "One function everywhere versus different ones per role: one simplifies the specification and tooling, but a break affects every use at once."],
    p: ["Hashing structured data without a clear boundary between fields lets two different inputs produce the same digest.", "Truncating digests to save space lowers collision resistance below the level the security argument assumed."],
    v: "Compute digests for the published test vectors, including empty input and very long input, and confirm every value matches the reference on all supported platforms.",
    dep: []
  },
  "digital-signatures": {
    s: "A scheme by which a private key signs data and anyone with the public key can check it, proving that a transaction or vote was authorized.",
    d: "Keys are generated from secure randomness. Signing hashes the message and produces a signature that depends on a secret nonce, which must never repeat or be predictable. Verification takes the message, signature and public key. The scheme and curve are fixed by the protocol. Some schemes allow recovering the public key from the signature to save space. The hardest practical issues are implementation ones: nonce generation, constant-time execution, and exact agreement across libraries on which encodings are valid.",
    k: ["Deterministic nonces versus random: deterministic nonces remove the risk of a bad random source leaking the key, but expose a different class of fault-injection attacks.", "Public key recovery versus transmitting the key: recovery makes signatures compact and transactions smaller, but requires an extra verification step and a defined behavior for invalid cases."],
    p: ["Reusing a nonce even once reveals the private key.", "Different handling of unusual but mathematically valid signatures by two libraries is a consensus split waiting for a crafted input."],
    v: "Verify a set of known good signatures and a set of malformed ones, including boundary values, with every library the node links, and confirm all accept and reject exactly the same cases.",
    dep: ["hash-functions"]
  },
  "signature-aggregation": {
    s: "Combining many signatures over related messages into one compact signature that verifies against the combined public keys, so thousands of votes can be checked at once.",
    d: "With a scheme that supports aggregation, signatures from many validators on the same message are added together. The result is the same size as one signature, and verification requires one pairing check against the sum of the public keys of those who signed, tracked by a bitfield. This reduces block size and CPU use dramatically for votes. The challenge is rogue-key attacks, prevented by proving possession of each key at registration, and the cost of a heavy pairing operation relative to ordinary signatures.",
    k: ["Aggregate in committees then again at the block level versus carry individual signatures: aggregation cuts bandwidth by orders of magnitude, but loses the ability to attribute each signature without the bitfield.", "Batch verification of many aggregates versus one at a time: batching speeds up import significantly, but if the batch fails, the node must find the bad item."],
    p: ["Accepting a registered key without proof of possession allows a rogue key that cancels others' contributions.", "Mixing messages in one aggregate without domain separation lets a signature be reinterpreted for another purpose."],
    v: "Aggregate 1,000 test signatures on one message, verify against the sum of the public keys, then remove one signer's key from the sum and confirm verification fails.",
    dep: ["digital-signatures","hash-functions"]
  },
  "merkle-tree-library": {
    s: "The shared code that builds hash trees over lists and produces and checks proofs, used for transaction roots, receipt roots and state commitments.",
    d: "Given a list of items, the library hashes each leaf, combines pairs upward to a root and returns the root. For a proof, it returns the siblings on the path. Details are defined by the protocol: how odd levels are handled, whether leaves and nodes use different prefixes, and the tree's maximum depth. Different parts of the chain use different tree shapes, but sharing one carefully tested library avoids repeated mistakes. The hardest practical issue is domain separation, since without it a leaf can be passed off as an inner node.",
    k: ["Distinguish leaves from inner nodes by a prefix versus not: prefixes block second-preimage tricks where an internal node is presented as a leaf, at the cost of a slightly more complex format.", "Duplicate the last node on odd levels versus pad with a defined value: duplication is simple but lets different lists share a root, so padding or length mixing is safer."],
    p: ["Two lists that differ only by a duplicated last item hash to the same root under a naive rule.", "A tree implementation that recomputes everything on a single change is too slow for per-block use."],
    v: "Build the root of lists of length 0, 1, 2, 3 and 1,000 on two implementations, confirm identical roots, and confirm no two different lists of these lengths produce the same root.",
    dep: ["hash-functions","canonical-serialization"]
  },
  "canonical-serialization": {
    s: "The single, exact byte representation of every consensus object, so equal values always produce equal bytes and hashes on every node.",
    d: "The format defines integer widths and byte order, how lists and optional fields are encoded, and what counts as malformed. Decoders reject anything non-canonical: leading zeros in numbers, extra bytes, unordered map keys, overlong lengths. Because hashes and signatures are computed over these bytes, any freedom in the encoding is a source of malleability or disagreement. The format should also be quick to decode and impossible to blow up in memory. A length field read before allocation is a classic attack.",
    k: ["Schema-driven fixed layout versus self-describing format: fixed layouts are compact, fast and unambiguous for consensus, but need the schema everywhere, while self-describing ones are easier to inspect and have more room for variation.", "Reject non-canonical forms versus normalize them: rejection keeps one valid encoding per value, but older data produced before the rule may need an exception."],
    p: ["Allocating memory from an untrusted length prefix lets a 10-byte message demand gigabytes.", "Two encoders that order optional fields differently produce different hashes for the same logical object."],
    v: "Round-trip a corpus of 100,000 generated objects through encode, decode and encode, confirm identical bytes each time, and confirm that every mutated non-canonical variant is rejected.",
    dep: ["hash-functions"]
  },
  "proof-verification": {
    s: "Checking succinct cryptographic proofs, such as set membership, polynomial openings or validity proofs, against a commitment, at a cost far below redoing the work.",
    d: "Verification takes a commitment, a claimed value and a proof, and runs a small computation that accepts only if the claim is true. Uses include inclusion proofs for tree entries, commitments to blob data, and proofs that a batch of off-chain computation was done correctly. Verifiers are native code with fixed costs, exposed to contracts as precompiled functions and used by clients for checking data. The challenge is that the verifier's correctness is critical, while the underlying mathematics is complex and trusted setups or parameters must be handled with care.",
    k: ["Verify natively in the client versus inside contract code: native verification is fast and cheap, but fixes the proof system in protocol, while in-contract verification allows any system and costs far more.", "Proof systems with a trusted setup versus transparent ones: trusted setups give small proofs and a one-time ceremony risk, while transparent systems avoid it and have larger proofs."],
    p: ["Accepting a proof without checking that the claimed inputs are in the right range makes unsound claims verify.", "A verifier that panics on malformed input lets any peer crash the node."],
    v: "Verify a set of valid proofs, a set with one bit flipped each and a set of malformed encodings, and confirm every valid one passes, every invalid one fails and none crash the node.",
    dep: ["hash-functions","merkle-tree-library"]
  },
  "system-clock": {
    s: "The node's source of wall-clock time, which defines slots, timestamps and deadlines, and must stay within a fraction of a second of the network.",
    d: "In proof of stake, time is divided into fixed slots from the chain's start time, and each duty has a deadline within the slot. Blocks carry timestamps that must be later than the parent and not too far ahead of local time. Nodes reject blocks from the future and tolerate small drift. Clock sync comes from the operating system's network time service. Proof-of-work chains use time only for bounds and difficulty. Time is the only consensus input that nodes do not share, which makes a skewed clock a subtle fault.",
    k: ["Strict future-block rejection versus wide tolerance: strict rules limit timestamp manipulation, but make nodes with small clock errors reject honest blocks, while wide tolerance weakens difficulty and time-lock guarantees.", "Trust the operating system's clock versus discipline it against peers: the local clock is simple, but peer-based correction adds an attack surface that could shift time for the node."],
    p: ["A virtual machine paused and resumed resumes with the wrong time and misses or double-proposes duties.", "A clock that is a second fast makes a validator vote before the proposal arrives, for the wrong head."],
    v: "Offset a test node's clock by 2 seconds and confirm it logs the skew, misses slot deadlines measured against chain data, and rejects blocks timestamped beyond its tolerance, then resync and confirm normal behavior.",
    dep: []
  },
  "adversarial-assumptions": {
    s: "The statement of what attackers can do, such as the share of work or stake they control and whether they can partition the network, against which every design choice is measured.",
    d: "Each protocol defines its threat model: the portion of power an attacker can hold, the delay the network may impose, and whether participants can be bribed or coordinated. Properties like safety and liveness are guaranteed only within these bounds. The model reaches into every layer: peer scoring assumes any peer may lie, fork choice assumes an attacker may withhold blocks, and light clients assume a majority is honest. The danger is leaving the assumptions implicit, because components then silently rely on different ones.",
    k: ["Assume an honest majority versus assume rational actors: honest-majority models are simple to analyze, while rational-actor models fit real incentives and are harder to prove.", "Design for the strongest attacker versus a realistic one: designing for the strongest costs performance everywhere, while a realistic model risks failing when conditions change."],
    p: ["Two components assuming different network delay bounds fail only when delay approaches both limits.", "A parameter tuned for an attacker with ten percent of power is unsafe if stake concentrates beyond it."],
    v: "Simulate a withholding attack with a stated fraction of power on a test network and confirm the measured reorganization depth stays within the bound the specification claims for that fraction.",
    dep: []
  },
  "consensus-critical-determinism": {
    s: "The requirement that every line of code deciding whether a block is valid yields identical results on every machine, in every client, for all time.",
    d: "Anything that affects validity is consensus-critical: serialization, signature checks, execution, tree hashing and fork rules. These parts avoid dependence on time, memory layout, thread order and libraries with undefined edge cases. Changes need extra review and test vectors because a one-bit difference splits the network. The surrounding code, such as the pool, the interface and the peer layer, may vary freely. Keeping this boundary clear is the main architectural discipline of a node.",
    k: ["Strict isolation of consensus code versus shared utilities everywhere: isolation limits what reviewers must scrutinize, but means some logic is written twice.", "Freeze historical behavior forever versus fix old bugs: freezing keeps old blocks replayable, but means known bugs stay permanently in the rules."],
    p: ["A routine dependency upgrade changes the behavior of a library used in validation and splits the network.", "A bug fix in one client changes an old edge case that other clients still implement as it was."],
    v: "Replay the full public history on each supported client version and platform and confirm every block's state root matches the published one, before releasing any change to consensus code.",
    dep: ["state-transition-function","canonical-serialization"]
  },
  "incentives-and-economics": {
    s: "The reward, fee and penalty structure that makes following the rules more profitable than breaking them, and pays for the security the network depends on.",
    d: "Producers and voters earn issuance and fees, and pay costs for hardware, stake and risk. The protocol sets rewards for timely duties, penalties for absence and destruction of stake for provable misbehavior, and prices for block space. If cheating pays, participants will cheat, so each rule is checked against the question of who profits. The economics reach into code: reward formulas, fee burn and ordering freedom for producers are all consensus rules whose small variations change behavior.",
    k: ["Rewards that reflect actual performance versus flat per-slot pay: performance-based rewards encourage uptime and honest voting, but add complexity and consensus-critical accounting.", "Fee revenue versus issuance as the main security budget: issuance is predictable but inflates the supply, while fee-based security varies with demand and is weakest when the chain is quiet."],
    p: ["Rewards that favor the first to submit create a race that hurts propagation fairness.", "Insufficient penalties for downtime make it rational for operators to run weak, cheap nodes."],
    v: "Run a test network for 100 epochs with one validator offline and one voting late, and confirm that their per-epoch balance changes match the reward and penalty formulas and are lower than those of a fully online validator.",
    dep: ["block-rewards","fee-market","slashing-conditions"]
  },
  "client-diversity": {
    s: "The existence of several independent implementations of the protocol, so a bug in one does not decide the fate of the whole network.",
    d: "If most nodes run the same code, a single bug can make the entire network accept an invalid block or halt. With several clients, written separately from the specification, a bug usually hits a minority. Diversity requires a precise specification, shared test vectors and clear interfaces between parts. It also adds costs: each upgrade must be implemented several times, and teams must coordinate. The measure that matters is the share of validators or nodes on each implementation, since a supermajority client still makes its bugs the network's.",
    k: ["Multiple clients versus one canonical implementation: diversity limits correlated failure, but slows change and makes ambiguities in the specification into possible splits.", "Encourage a balanced client share versus let the market decide: balance protects against a supermajority bug, but asks operators to choose a less popular client."],
    p: ["A client with more than two thirds of validators finalizes an invalid block, and nothing in the network can stop it.", "An ambiguity in the specification gets implemented two ways and surfaces on mainnet during an unusual block."],
    v: "Feed one stream of mixed valid and invalid blocks to every client and confirm each reaches an identical decision and state root for every block; report the share of mainnet nodes per client.",
    dep: ["consensus-test-vectors","consensus-execution-interface"]
  },
  "resource-limits-and-dos": {
    s: "The bounds on every resource a hostile party can consume on a node: bandwidth, CPU, memory, disk and connections, enforced at each layer.",
    d: "An open network means anyone can send anything. Each layer has caps: message and block sizes, per-peer request rates, pool size, execution cost, response sizes, connection counts and cache sizes. Work done before authentication is minimized, and expensive checks run after cheap ones. The principle is that the cost to the attacker should be at least the cost to the node. The challenge is that limits are spread across layers and set by different teams, so a missing limit in one place becomes the weakest link.",
    k: ["Strict limits everywhere versus generous limits with monitoring: strict limits stop attacks in advance, but risk rejecting legitimate peaks, while generous ones tolerate bursts and find out about abuse later.", "Charge attackers in the protocol with fees versus in the node with policy: protocol-level fees are universal and verifiable, but cannot cover traffic before a transaction exists."],
    p: ["An operation priced at a tiny fee but costing milliseconds of disk reads is a cheap way to stall the network.", "Limits applied in the pool and not in the block validator leave a way to craft a block that is slow to check."],
    v: "Drive each interface with a hostile load, such as 10,000 connections, oversized messages and expensive queries, and confirm memory, CPU and open sockets stay under the configured ceilings while the node keeps importing blocks.",
    dep: ["access-control-and-limits","gas-metering","peer-scoring"]
  },
  "upgradeability-and-compatibility": {
    s: "The need to change rules on a live network without breaking old data, old contracts or old nodes, and the rules for when breaking them is acceptable.",
    d: "Every rule ever in force must stay replayable: old blocks validate under the rules of their time. New features arrive as forks with activation points, and old behavior is kept as code paths selected by block. Some changes are soft, and old nodes keep following; others are hard, and old nodes must upgrade. Backward compatibility with existing contracts and tools constrains design. The cumulative effect is a growing set of historical rules that every client carries and that new engineers must understand.",
    k: ["Preserve old behavior forever versus allow breaking changes with migration: preserving keeps all history and contracts working, but accumulates complexity, while breaking changes simplify code and strand some users.", "Frequent small forks versus rare big ones: small forks limit blast radius and test surface, but keep operators on constant alert."],
    p: ["Removing support for an old transaction type breaks resyncing from genesis.", "A change to gas cost that seems minor breaks deployed contracts that assumed the old amount."],
    v: "Sync a fresh node from genesis through every past fork and confirm it matches published state roots at each activation point, then run a pre-upgrade contract on a test network after the upgrade and confirm unchanged behavior.",
    dep: ["fork-activation-rules","protocol-parameters","full-sync-replay"]
  }
});
