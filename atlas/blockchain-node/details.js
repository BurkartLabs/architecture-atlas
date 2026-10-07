// Details for the blockchain node plate, part 1: interfaces, operations, transactions, mempool.
ATLAS.details("blockchain-node", {
  "json-rpc-server": {
    s: "The request-response endpoint through which wallets, explorers and applications read chain data and submit transactions, usually over HTTP or a local socket with a JSON encoding.",
    d: "The server parses a method name and parameters, resolves block references such as latest or finalized, reads from the state database or chain store, and returns a result or a structured error. Methods are grouped into namespaces, and operators enable only the groups they trust. The hard parts are consistency and cost: a query must read one coherent state while new blocks arrive, and a single request such as scanning a long log range can consume more resources than thousands of cheap ones.",
    k: ["Read against a named block versus the moving head: named blocks give repeatable answers and survive reorganizations, but clients must track which block they asked about.", "One shared endpoint for all namespaces versus separate ports per trust level: separation lets public reads be exposed safely, at the cost of more configuration and more places to misconfigure."],
    p: ["Exposing administrative methods on a public port lets anyone read private data or change node settings.", "A query spanning an unbounded block range ties up a worker for minutes and starves other callers."],
    v: "Request a balance at a specific historical block twice while new blocks arrive and confirm both responses are identical, then request it at latest and confirm it changes after the next block.",
    dep: ["state-database","block-store","access-control-and-limits"]
  },
  "subscriptions": {
    s: "A push channel over a persistent connection that notifies clients of new blocks, pending transactions or matching events, so they do not poll the node.",
    d: "A client opens a long-lived connection and registers a filter. The node keeps the filter, and when a new head arrives it evaluates logs against each filter and pushes matches. On a reorganization it must also push removal notices for events that are no longer on the canonical chain. Per-connection buffers hold events until the client reads them. The difficulty is slow consumers: a client that stops reading ties up memory, and the node must decide whether to drop events, block, or disconnect.",
    k: ["Push with removal notices versus pure append events: clients stay correct through reorganizations, but every consumer must handle events being retracted.", "Bounded per-client buffers that disconnect slow readers versus unbounded queues: bounded buffers protect the node, but a client that falls behind must resynchronize from a known block."],
    p: ["Treating a pushed event as final lets an application act on a log that a reorganization then removes.", "Thousands of idle subscriptions each holding a buffer exhaust memory during an event burst."],
    v: "Subscribe to new heads, force a one-block reorganization on a test network, and confirm the client receives the replaced block's removal marker followed by the new canonical head.",
    dep: ["json-rpc-server","log-and-event-queries","reorg-handling"]
  },
  "transaction-submission": {
    s: "The entry point where a locally submitted signed transaction is checked, placed in the pool and handed to the network layer for broadcast.",
    d: "A client sends an already signed transaction. The node decodes it, runs the validity checks and pool admission rules, and returns the transaction hash if accepted or a specific rejection reason. It then queues the transaction for propagation. Acceptance is local and means only that this node will relay it; it says nothing about inclusion. The difficult part is the gap between accepted and confirmed: clients need a way to tell pending, dropped, replaced and included apart, and the node can only report what it has seen.",
    k: ["Return the hash immediately versus wait for inclusion: immediate return keeps the call fast and stateless, but pushes tracking and retry logic onto every client.", "Reject locally at submission versus accept and let the network reject: local rejection gives fast feedback, but a stricter local policy can disagree with what miners or validators accept."],
    p: ["A client reads a successful submission as inclusion and ships goods while the transaction is stuck below the going fee.", "Retrying after a timeout with a new nonce creates two conflicting transactions that both might confirm."],
    v: "Submit a valid transaction and a copy with a bad signature and confirm the first returns a hash found in the pool and the second returns a named signature error without entering the pool.",
    dep: ["mempool-admission","intrinsic-validity-checks","relay-policy","json-rpc-server"]
  },
  "log-and-event-queries": {
    s: "Queries over historical events emitted by transactions, answered by an index that maps event topics and emitters to blocks without re-executing history.",
    d: "As each block is executed, the node records emitted logs in receipts and updates a bloom filter in the block header and, often, a separate index from topic to block ranges. A query names a block range and filters on emitter and topics. The node uses the filters to skip blocks that cannot match, then reads and checks receipts in candidate blocks. It is hard because ranges can be very large, bloom filters have false positives, and the index must be rebuilt consistently when a reorganization replaces blocks.",
    k: ["Per-block bloom filters versus a dedicated topic index: blooms cost almost nothing to build, but lose selectivity on busy chains, while an index answers fast and takes disk and maintenance.", "Cap the range per query versus allow any range: caps protect the node, but force clients to paginate and to handle partial answers."],
    p: ["Treating a bloom match as proof the event exists returns false results unless receipts are also checked.", "An index not rolled back on a reorganization returns events from blocks that are no longer canonical."],
    v: "Emit a known event in three blocks over a 10,000-block range, query the whole range by topic, and confirm exactly three results are returned in order within the configured time limit.",
    dep: ["event-logs","transaction-receipts","block-store","json-rpc-server"]
  },
  "trace-and-debug-api": {
    s: "Developer-facing methods that replay a transaction or block and return every internal call, state change and instruction step, for debugging contracts and auditing fund flows.",
    d: "The node loads the parent state, re-executes the target transaction with tracing hooks enabled, and records calls, storage reads and writes, and reverts. Because it needs historical state, it works best on archive-style nodes; otherwise it regenerates state by replaying blocks from the nearest retained point. Traces can be enormous, so the interface allows custom filters. The hardness is cost and exposure: a trace of a heavy block takes seconds of CPU and exposes details no normal query does.",
    k: ["Regenerate old state by replay versus keep all historical state: replay saves disk but makes the first trace of an old block slow, and unbounded replay can stall the node.", "Fixed trace formats versus programmable tracers: programmable tracers answer any question, but run user logic inside the node and need strict time and memory limits."],
    p: ["Enabling the debug namespace on a public endpoint allows anyone to submit expensive replays that consume all CPU.", "A trace produced with different rules than the original execution reports behavior that never happened."],
    v: "Trace a historical transaction containing a nested call and a revert and confirm the call tree, gas used and revert reason match the receipt stored in the block.",
    dep: ["state-transition-function","state-database","pruning-policy","access-control-and-limits"]
  },
  "access-control-and-limits": {
    s: "Authentication, method allow-lists, request quotas and timeouts that stop the public interface from being used to exhaust or take over the node.",
    d: "The interface binds to local addresses by default. Requests are checked against a list of enabled methods, an authentication token where required, and per-client rate limits. Each call has time, memory and result-size caps, and the server limits concurrent connections. Operators usually put a proxy in front for TLS and per-key quotas. The challenge is that cost is not proportional to request size: two requests of the same length can differ in work by a factor of a million.",
    k: ["Rate limit by request count versus by estimated cost: counts are simple and predictable, but cost-based limits stop the one expensive query that counts miss, at the price of an estimator that can be wrong.", "Shared secret on the node versus a proxy that holds credentials: the proxy centralizes policy and logging, but adds another component that can fail or leak."],
    p: ["Binding the interface to all addresses by default exposes unauthenticated methods to the internet.", "Cross-origin permissions left open let any web page call the node from a visitor's browser."],
    v: "From an unlisted address, send a request for a disabled method and a burst above the quota, and confirm the first is refused with a method error and the second returns a rate-limit status.",
    dep: []
  },
  "node-configuration": {
    s: "The settings that choose network, sync mode, pruning, peer limits and enabled interfaces, with defaults tuned so a plain start joins the main network safely.",
    d: "Settings come from a file, flags and environment, with flags winning. The most important choose the network identifier and genesis, the data directory, the sync mode, the cache sizes and which interfaces are on. The node validates them at startup and refuses to run on a data directory created for another network. It is hard because settings interact: cache size, peer count and sync mode together determine memory use and whether the node can keep up, and some changes cannot be reversed without a full resync.",
    k: ["Strong defaults versus explicit required choices: defaults let anyone start, but a wrong default silently runs a node in a mode the operator did not intend.", "Fail on a mismatched data directory versus attempt migration: failing is safe, but migration saves days of resync when it is correct."],
    p: ["Pointing a test configuration at a production data directory corrupts the database or fails after hours of work.", "Setting the cache larger than free memory makes the node swap and fall behind the chain."],
    v: "Start the node with a data directory created for a different network and confirm it exits at once with an error naming both network identifiers instead of opening the database.",
    dep: []
  },
  "metrics-and-logging": {
    s: "Counters, gauges and structured logs that show chain head, peer count, sync progress, pool size and resource use, so an operator can tell a healthy node from a stuck one.",
    d: "Each component exports metrics to an in-process registry, scraped over an HTTP endpoint or pushed to a collector. Key signals are head block age, peer count, pool size, block import time, database size growth and, for validators, missed duties. Logs record events such as reorganizations and sync phase changes at configurable levels. The challenge is choosing signals that predict trouble: a node can have many peers and still be on a minority chain, so head hash comparison across independent sources matters.",
    k: ["Many fine-grained metrics versus a few curated ones: fine-grained data helps diagnose, but costs memory and invites dashboards nobody reads.", "Log every reorganization versus only deep ones: complete logs aid forensics, but on some networks shallow reorganizations are routine and bury real alerts."],
    p: ["Alerting on peer count alone misses a node that is connected but stalled on an invalid block.", "Debug logging left on during sync writes gigabytes an hour and fills the disk the database needs."],
    v: "Stop block imports on a test node and confirm the head-age metric rises one second per second and an alert on it fires within the configured window.",
    dep: []
  },
  "validator-key-management": {
    s: "Creation, encryption, storage and loading of the keys a node uses to sign blocks and votes, separated from keys that control the staked funds themselves.",
    d: "A signing key is generated from a seed, encrypted with a passphrase and stored in a keystore file. At startup the node decrypts it into memory. Most designs separate the key that signs duties from a withdrawal key kept offline, so a stolen signing key can misbehave but not take the funds. Multiple keys per node are common. The difficulty is that a key must exist on exactly one running node: copying it for failover is the usual cause of double-signing penalties.",
    k: ["Hot signing key with offline withdrawal key versus one key for both: separation limits theft to penalties and downtime, but requires a second, carefully backed-up secret.", "Keys in node memory versus delegated signing: memory is simple and fast, but a compromised node leaks the key, which is why the remote signer exists."],
    p: ["Restoring a backup onto a second machine while the first is still running produces conflicting signatures and a penalty.", "Losing the only copy of the withdrawal secret strands the funds permanently."],
    v: "Load a keystore with the right passphrase and confirm duties are signed; load it with a wrong passphrase and confirm the node refuses to start validating and logs which key failed.",
    dep: ["digital-signatures","slashing-protection"]
  },
  "remote-signer": {
    s: "A separate process or device that holds validator keys and signs only requests that pass its own checks, so the node itself never sees the key.",
    d: "The node sends the object to be signed, such as a block header or vote, with its type and slot, over an authenticated channel. The signer checks the request against its own copy of the slashing-protection history and its allow-list, signs, and returns the signature. The key may live in dedicated hardware. It is hard because the signer must be as available as the node, adds latency inside strict timing windows, and must still be correct when the node it serves is compromised.",
    k: ["Signer keeps its own protection history versus trusting the node: its own history survives a compromised node, but it must stay in step with chain data it cannot observe directly.", "Single signer shared by several nodes versus one per node: sharing allows failover without key copies, and creates a single point of failure and a coordination point."],
    p: ["A signer that signs whatever it is sent offers no protection once the node is compromised.", "Network delay to the signer pushes votes past the deadline and costs rewards every slot."],
    v: "Ask the signer to sign two conflicting blocks for the same slot and confirm the second request is refused with a protection error while the first signature verifies against the public key.",
    dep: ["validator-key-management","slashing-protection","digital-signatures"]
  },
  "slashing-protection": {
    s: "A local record of everything this validator has signed, consulted before every signature to refuse any request that would conflict with it.",
    d: "Before signing, the guard checks the request against the highest slot, source and target it has already signed for each key. It refuses anything that would be a conflicting block at the same slot or a contradictory vote. The history lives in a small database that is written and flushed before the signature is released. Exporting and importing the record lets a validator migrate between machines. The difficulty is ordering: a crash between signing and recording must not permit a conflicting signature after restart.",
    k: ["Write the record before releasing the signature versus after: before is safe through crashes, but adds a synchronous disk write inside a tight deadline.", "Per-key history in a portable interchange format versus a node-internal format: portable files ease migration between clients, but require every client to agree on semantics."],
    p: ["Migrating without exporting the history lets the new node sign something the old one already signed differently.", "Restoring an old database backup rewinds the record and permits a signature the guard once knew to refuse."],
    v: "Sign a block at slot N, restart the node, then request a different block at slot N and confirm the guard refuses it by reading the persisted record.",
    dep: ["slashing-conditions","digital-signatures"]
  },
  "transaction-encoding": {
    s: "The exact byte layout of a transaction, including type tags and field order, which defines both what is signed and what the transaction hash covers.",
    d: "Fields are written in a fixed order using a canonical serialization, optionally preceded by a type byte that selects a format version. The signature covers a hash of the encoded fields, and the transaction identifier is a hash of the full bytes. Decoders reject trailing bytes, non-minimal numbers and unknown types. It is hard because there must be exactly one valid encoding of each logical transaction: if two encodings mean the same thing, they give two identifiers, and malleability lets a third party change an identifier without changing meaning.",
    k: ["Typed envelopes with a leading version byte versus one fixed layout: types allow new features without breaking old ones, but every node must handle every historical type forever.", "Hash over the signed fields only versus over signature too: excluding the signature from the identifier prevents malleability, at the cost of more complex rules for what each hash covers."],
    p: ["Accepting a non-canonical encoding lets two nodes disagree about whether a transaction is valid.", "A decoder that stops at the first valid prefix ignores extra bytes that another node rejects."],
    v: "Re-encode a decoded real transaction and confirm the bytes are identical to the original, and confirm a copy with one extra trailing byte is rejected at decode time.",
    dep: ["canonical-serialization","hash-functions"]
  },
  "transaction-format": {
    s: "The fields of a transaction: who authorizes it, what it changes, how much it may cost, and the limits that bound its effect.",
    d: "Account-based formats carry a sender nonce, destination, value, payload, a resource limit and fee fields. Output-based formats carry references to earlier outputs being spent and a list of new outputs with locking conditions. Newer types add optional fields such as expiry, access hints or attached data blobs. Each field is a consensus rule: its range, its default and its interaction with others must be defined for every node. The hard part is adding fields later without changing the meaning of old transactions.",
    k: ["Fee fields set by sender versus protocol-computed base plus tip: protocol-set bases make costs more predictable, but make the format and block rules more intricate.", "Optional fields in new types versus extending the existing type: new types keep old ones frozen, at the cost of parallel code paths that never go away."],
    p: ["Omitting an explicit chain identifier from the signed fields makes a transaction valid on a fork too.", "Fields with no upper bound let a single transaction demand more memory than any node expects."],
    v: "Construct one transaction of each supported type, sign it, and confirm a second implementation decodes every field to the same values and recovers the same sender.",
    dep: ["transaction-encoding","utxo-or-account-model"]
  },
  "signature-verification": {
    s: "Checks that a transaction was authorized by the owner of the spending account, recovering or checking a public key against the signature.",
    d: "The node hashes the signed fields, then verifies the signature against a known public key or recovers the key from the signature and derives the sender address. Verification is the most expensive stateless check, so nodes batch it across many transactions and cache results from the pool when the block arrives. Rules fix the curve, the accepted signature encodings and any low-value requirements. It is hard because signature libraries differ in edge cases, and a consensus-critical check must reject every case that any other node rejects.",
    k: ["Verify at pool admission and again at block time versus cache the result: caching saves large CPU at block import, but the cache key must cover every signed byte.", "Strict canonical signature forms versus accepting any valid form: strict forms prevent malleability, but older transactions may need grandfathered exceptions."],
    p: ["Two libraries that disagree on an edge-case signature split the network on one crafted transaction.", "Skipping verification during bulk sync for speed is safe only behind a trusted checkpoint, and is easily applied beyond it."],
    v: "Feed a set of known valid, invalid and edge-case signatures from shared test vectors and confirm accept and reject results match the reference for every vector.",
    dep: ["digital-signatures","hash-functions","transaction-format"]
  },
  "replay-protection": {
    s: "Binding a transaction to one network and one use, so it cannot be copied to a fork or submitted twice.",
    d: "Two mechanisms work together. A chain identifier in the signed data makes a transaction invalid on any other network or fork that sets a different value. A sequence number per account, or consumption of a specific output, makes each transaction usable once. Nodes check the sequence number against current state and reject gaps or repeats. The difficulty arrives at forks: before a split nothing distinguishes the two chains, so a transaction signed earlier is valid on both unless the fork changes the identifier.",
    k: ["Account sequence numbers versus unique outputs: sequence numbers are compact and ordered, but force strict in-order handling and make parallel submission harder.", "Chain identifier in the signature versus relying on state differences: the identifier is explicit and cheap, but old transactions without it remain replayable."],
    p: ["After a contentious split, users spend on one chain and the same transaction is replayed on the other.", "A wallet that reuses a sequence number sends two conflicting transactions, and only one can ever confirm."],
    v: "Take a transaction signed for one test network, submit it to a second network with a different identifier, and confirm it is rejected with an identifier error while the original network accepts it.",
    dep: ["transaction-format","signature-verification","state-dependent-validity"]
  },
  "utxo-or-account-model": {
    s: "The choice of how value is tracked: as a set of unspent outputs that transactions consume and create, or as balances held in accounts that transactions debit and credit.",
    d: "In the output model, the state is the set of unspent outputs; a transaction names outputs to spend and creates new ones, so validity checks are independent per input and transactions in a block can be verified in parallel. In the account model, the state maps addresses to balances, nonces and code; a transaction reads and writes shared accounts, so order matters. The choice shapes the state commitment, the fee mechanism, privacy properties and what contracts can express.",
    k: ["Output model versus account model: outputs parallelize and avoid replay by construction, while accounts give simpler programmability and smaller transactions but serialize on shared state.", "Stateful scripts attached to outputs versus code held at addresses: outputs keep verification local and bounded, accounts allow long-lived contracts at the cost of unbounded state growth."],
    p: ["Dust outputs too small to be worth spending accumulate in the state and cost every node permanent storage.", "In the account model, two transactions touching one hot account conflict, and ordering between them becomes a source of value for producers."],
    v: "Apply a block of 100 transfers to a snapshot and confirm the total value in the state before and after differs only by the fees and issuance, under either model.",
    dep: ["authenticated-state-tree","transaction-format"]
  },
  "intrinsic-validity-checks": {
    s: "Checks that need only the transaction itself: size limits, well-formed fields, signature, minimum fee and a resource limit that covers the base cost.",
    d: "Intrinsic checks run first because they are cheap and need no state: the transaction must decode, fit under the size cap, carry a recognized type, have a valid signature, include a resource limit at least as large as the minimum charge for its payload, and not exceed the block's per-transaction cap. Failing any means the transaction can never be valid. The node can therefore discard it and may penalize the peer that sent it. The challenge is putting expensive checks after cheap ones so a flood of garbage costs little.",
    k: ["Order checks from cheapest to most expensive versus a fixed logical order: cheapest-first resists floods, but must not change which error or outcome the protocol specifies.", "Penalize the sender peer for an invalid transaction versus just drop it: penalties limit abuse, but an honest peer relaying across a rule change may be punished unfairly."],
    p: ["Verifying the signature before the size check lets one oversized transaction cost far more than its relay is worth.", "A limit enforced in the pool but not in block validation allows blocks that other nodes reject."],
    v: "Send an oversized transaction, one with a malformed field, and one with an invalid signature, and confirm each is rejected with its own reason and that rejection costs under a millisecond for the first two.",
    dep: ["transaction-encoding","signature-verification","protocol-parameters"]
  },
  "state-dependent-validity": {
    s: "Checks that need current state: the sender exists, the sequence number matches, the balance covers value plus maximum fee, and the code and storage conditions allow it.",
    d: "These checks run against the state at the parent block, or against the pool's projection of state after pending transactions. The sender's nonce must equal the expected value, the balance must cover the maximum possible cost, and for output models each referenced output must exist and be unspent. A transaction can be valid now and invalid a block later, so the result is only a prediction until a block includes it. It is hard because each verdict depends on a particular state and block context.",
    k: ["Check against the head state versus against projected pending state: the head is simple and exact, but projection is needed to accept a chain of dependent transactions in one batch.", "Reserve the maximum fee up front versus charge afterward: reserving prevents unpayable transactions from running, but makes every sender hold more than the transaction ends up costing."],
    p: ["Balance checked at admission is spent by an earlier pending transaction, so the later one fails at inclusion and wastes a producer's slot.", "Checks done against the wrong block context accept transactions that become invalid after a reorganization."],
    v: "Submit a transaction with a nonce one too high and one with a balance one unit too low and confirm each is held or rejected with the specific reason, then correct each and confirm acceptance.",
    dep: ["authenticated-state-tree","account-records","replay-protection"]
  },
  "mempool-admission": {
    s: "The policy that decides whether a validated pending transaction enters the node's pool, based on fees, size, pool capacity and per-sender limits.",
    d: "After validity checks, the pool applies local policy: a minimum fee, per-account caps on pending transactions, limits on dependent chains and a ceiling on total memory. Admission is not consensus, so nodes can differ, and policy is usually stricter than consensus to protect resources. The pool indexes transactions by hash, by sender and by price. The tension is between openness and protection: strict rules block spam but also block legitimate bursts and let well-funded actors push others out.",
    k: ["Strict local policy versus accepting anything consensus allows: strict policy protects memory and bandwidth, but transactions that miners would take get stuck without any relay path.", "Per-sender caps versus a global fee threshold: caps stop one account filling the pool, but a threshold alone lets a large account crowd out many small ones."],
    p: ["A node with a lower fee floor than its peers accepts transactions it cannot relay, and users see them as pending forever.", "Admitting a long chain of dependent transactions lets one sender consume the whole pool."],
    v: "Fill the pool with transactions at the fee floor, submit one below it and one above the per-account cap, and confirm both are refused with distinct reasons while a higher-fee one is accepted.",
    dep: ["intrinsic-validity-checks","state-dependent-validity","fee-market"]
  },
  "mempool-ordering": {
    s: "The ranking of pending transactions that decides which a producer takes first, normally by effective fee per unit of resource, subject to dependency order.",
    d: "The pool maintains transactions from each sender in sequence order, with only the next executable ones eligible. Across senders, it ranks eligible transactions by the fee a producer would actually collect, accounting for the current base fee. Transactions that are not yet executable, because of a nonce gap, are held aside. For output models, ancestors and descendants are scored together as a package. The challenge is keeping this ranking correct as the base fee and state change with every block.",
    k: ["Rank by fee per resource unit versus by absolute fee: per unit maximizes revenue per block space, but disfavors large transactions that pay well overall.", "Package scoring of dependent transactions versus individual scoring: packages let a high-fee child pull in a low-fee parent, at the cost of a more complex algorithm that must be re-evaluated on every change."],
    p: ["Ordering that ignores the base fee keeps ranking transactions that can no longer be included.", "Re-sorting the entire pool on every new block adds seconds of delay during a busy period."],
    v: "Insert 1,000 transactions with known fees and confirm the producer's selection returns them in descending effective fee, with each sender's transactions in nonce order.",
    dep: ["mempool-admission","fee-market"]
  },
  "transaction-replacement": {
    s: "The rule that lets a sender swap a pending transaction for a new one with the same sequence number, provided the new one pays enough more.",
    d: "A sender who wants to speed up or cancel a stuck transaction signs another with the same sequence number and a higher fee. The pool accepts it only if the fee rises by a set minimum percentage, so cheap replacements cannot flood the network with bandwidth-free churn. The old transaction is dropped and the new one relayed. The difficulty is that the old one may already be in other nodes' pools or in a block being built, so a replacement is a request, not a guarantee.",
    k: ["Require a minimum fee bump versus accept any higher fee: the bump bounds the bandwidth an attacker can burn with replacements, but delays legitimate users who need a small increase.", "Allow replacement of any pending transaction versus only those flagged as replaceable: universal replacement is simple for users, but breaks merchants who accept unconfirmed payments."],
    p: ["A merchant accepts an unconfirmed payment and the sender replaces it with a self-payment before it confirms.", "The original transaction still confirms because a producer saw it first, so both the intent to cancel and the intent to pay are in doubt."],
    v: "Submit a transaction, then a same-sequence replacement with a 10 percent higher fee and one with 1 percent more, and confirm only the first replaces it in the pool.",
    dep: ["mempool-admission","replay-protection"]
  },
  "mempool-eviction": {
    s: "The policy for dropping pending transactions when the pool is full, when they age out, or when new blocks make them invalid.",
    d: "When capacity is reached, the pool removes the lowest-ranked transactions to admit better ones, and it discards anything that has waited longer than a set time. After each block, it removes included transactions and re-checks the rest against the new state, dropping any whose sequence number or balance no longer fits. After a reorganization, transactions from abandoned blocks are returned to the pool. The challenge is doing this work promptly without stalling block import.",
    k: ["Evict lowest fee first versus oldest first: lowest fee keeps the pool profitable, but old low-fee transactions that become valuable when fees fall are lost.", "Re-add transactions from reorganized blocks versus drop them: re-adding preserves user intent, but can reintroduce transactions that conflict with the new chain."],
    p: ["Dropping a transaction locally while peers keep it leads to users resubmitting and creating duplicates.", "Re-validating the full pool after every block takes longer than the block interval on a busy network."],
    v: "Fill a small pool to capacity, add a higher-fee transaction, and confirm the lowest-fee entry is evicted; then include a pending transaction in a block and confirm it leaves the pool.",
    dep: ["mempool-ordering","state-dependent-validity","reorg-handling"]
  },
  "relay-policy": {
    s: "Rules for which pending transactions a node forwards to peers and how, designed to spread valid transactions without letting peers waste bandwidth.",
    d: "Rather than push full transactions to every peer, nodes announce hashes and let a peer request the ones it does not have, which avoids sending the same bytes many times. Only transactions that passed admission are announced. A node limits announcement rates per peer and tracks what each peer already knows. Policy can be stricter than consensus, which means a valid transaction might not propagate. The trade-off is propagation speed against bandwidth, and both affect fairness between well-connected and poorly connected senders.",
    k: ["Announce hashes then fetch versus push full transactions: announcement saves bandwidth on large pools, but adds a round trip of latency before a transaction spreads.", "Relay only what passes local policy versus relay everything valid: policy-limited relay protects resources, but fragments the network into nodes with different views of what is pending."],
    p: ["Relaying transactions that no node will include wastes bandwidth and makes bandwidth-based attacks cheap.", "Announcing to every peer at once makes the sender's outbound bandwidth the bottleneck during bursts."],
    v: "Connect three test nodes in a line, submit a transaction on the first, and confirm the third requests it by hash within a bounded number of round trips and receives the full bytes only once.",
    dep: ["mempool-admission","gossip-mesh","peer-scoring"]
  },
  "fee-market": {
    s: "The mechanism that sets the price of block space: a protocol-determined base fee that moves with demand, plus an optional tip that buys priority.",
    d: "Each block has a size or resource target. If a block exceeds the target, the base fee for the next one rises; if it falls short, the fee falls, by a bounded fraction per block. The base fee is burned or redistributed by protocol rules, and the tip goes to the producer. Alternatively, a first-price auction lets senders bid freely. The difficulty is dynamics: a rule that adjusts too slowly leaves blocks full and fees spiking, and one that adjusts too fast oscillates.",
    k: ["Protocol-set base fee plus tip versus pure first-price auction: a base fee gives predictable costs and removes guessing, but makes the fee rule a consensus rule that must be tuned.", "Burn the base fee versus pay it to the producer: burning removes the incentive to manipulate demand, but changes the supply of the native asset."],
    p: ["A target that is too small makes ordinary use unaffordable during every burst.", "Sudden demand spikes outpace bounded adjustment, so for several blocks transactions wait regardless of fee."],
    v: "Drive 20 consecutive full blocks on a test network and confirm the base fee rises by the specified maximum fraction each block, then drive empty blocks and confirm it falls symmetrically.",
    dep: ["protocol-parameters","block-rewards","block-validation"]
  },
  "fee-estimation": {
    s: "Estimates what fee a transaction needs to be included within a target time, derived from recent blocks and the current pool.",
    d: "The estimator samples the fees of transactions included in recent blocks and the contents of the pool. For each target of a few blocks, it computes a percentile fee that would have been enough to be included. Methods use the current base fee plus a tip percentile, or track how long transactions at each fee level waited. Estimates are exposed through the interface for wallets. They are inherently predictions: a sudden burst or a change in producer policy makes them wrong, so they tend to lag the market.",
    k: ["Short recent window versus long window: a short window reacts quickly to spikes but is noisy, a long one is smooth but overpays after demand falls.", "Estimate from the pool versus from included history: pool-based estimates see current demand, but can be manipulated by transactions that are never meant to confirm."],
    p: ["Wallets that trust a stale estimate overpay by large multiples or leave a transaction pending for hours.", "An estimator trained on a quiet period gives no usable answer when the pool is full."],
    v: "Replay a recorded window of blocks, ask for the estimate for a three-block target, and confirm that fees at that level were included within three blocks in at least the stated fraction of cases.",
    dep: ["fee-market","mempool-ordering","json-rpc-server"]
  },
  "private-order-flow": {
    s: "Channels that send transactions straight to block producers, bypassing the public pool, to avoid front-running or to bundle several transactions atomically.",
    d: "Rather than broadcast, a sender gives a transaction or a bundle to a builder or producer through an authenticated channel, often with a payment contingent on inclusion. The producer simulates it against the pending state and includes it only if it pays. The node's interface can expose methods to receive bundles, and the consensus-execution boundary can hand block building to a separate party. It is hard because it shifts power: producers who see order flow privately can rank it for their own benefit.",
    k: ["Public pool versus private channel: public relay is open and censorship-resistant, while private channels protect against front-running but concentrate trust in a few builders.", "Bundles that must execute all-or-nothing versus independent transactions: atomic bundles enable arbitrage and safe sequences, but require simulation, which costs the builder CPU for every submission."],
    p: ["A private transaction stuck with an unresponsive builder cannot be seen or replaced through the public pool.", "Builders that pool most private flow can censor transactions without any visible rule violation."],
    v: "Submit a bundle of two dependent transactions privately and confirm both appear adjacent in the next built block, and that neither was visible in a peer's public pool beforehand.",
    dep: ["transaction-selection","block-assembly","mempool-admission"]
  }
});
