# Plate scopes, plates 51-200

What each plate covers. A plate's writer reads `docs/writing-a-plate.md` first, then its entry here. "Cover" lists the
topics the plate must include at least; the writer adds whatever else a complete map needs. "Related" names other
plates, which cover their own subject in depth, so treat those topics at the level of interfaces.

## Operating systems & low-level

### real-time-os: Real-time operating system
A small preemptive kernel for embedded devices with hard timing guarantees. Cover: priority-based preemptive scheduling, rate-monotonic and earliest-deadline-first scheduling, priority inversion and inheritance, interrupt handling and latency bounds, tick versus tickless timers, static allocation and memory pools, memory protection units, tasks, queues, semaphores, mutexes and event groups, interrupt-safe APIs, worst-case execution time analysis, board support packages, low-power modes, safety certification evidence, tracing. Related: os-kernel, microkernel.

### mobile-os: Mobile operating system
A smartphone operating system above the kernel. Cover: the application model and lifecycle (foreground, background, suspended, killed), process isolation per app, the permission model and runtime prompts, inter-app communication (intents or URL schemes), the app installer, signing and the store channel, background execution limits and job scheduling, push notification delivery, power management and wake locks, thermal management, the display and input stack, the media and camera services, location services, the telephony and radio interfaces, secure storage and biometrics, OTA system updates with A/B partitions, accessibility services, enterprise device management. Related: os-kernel, app-sandbox, window-compositor.

### window-compositor: Window system & compositor
The desktop display server and compositor. Cover: the client protocol and buffer sharing, surfaces and windows, the scene graph, damage tracking, compositing on the GPU, direct scanout and hardware overlay planes, mode setting and multiple monitors, fractional scaling and high DPI, vsync, frame timing and presentation feedback, input device handling, input routing and focus, keyboard layouts and input methods, pointer and touch gestures, window management policy, clipboard and drag and drop, screen capture and its permissions, color management and HDR, accessibility hooks, legacy client compatibility layers, crash recovery. Related: graphics-renderer, mobile-os.

### unikernel: Unikernel
An application compiled together with only the OS libraries it needs into one bootable image. Cover: the library OS model, the single address space, build-time configuration and dead code elimination, boot on a hypervisor, paravirtual device drivers, the network stack linked into the app, the filesystem or none, the threading model, memory management without paging, POSIX compatibility shims, debugging and profiling without a shell, logging and metrics export, image size and boot time, security properties (attack surface, no shell, no multi-user), orchestration of many images, updates by redeploying. Related: hypervisor, os-kernel, container-runtime.

### switch-os: Network switch operating system
The operating system of a data-center or campus network switch. Cover: the control plane CPU and the forwarding ASIC, the hardware abstraction layer for switch silicon, forwarding tables (MAC, routes, ACLs, TCAM management), the state database that links protocols to hardware, routing protocol daemons, link aggregation, VLANs and overlays (VXLAN), spanning tree, link-layer discovery, the management plane (CLI, configuration models, streaming telemetry), in-service software upgrade, warm restart, buffer and queue management, quality of service, counters and drops, platform management (fans, optics, power), container-based service architecture. Related: routing-daemon, sdn-controller, os-kernel.

### trusted-execution: Trusted execution environment
Hardware-isolated execution for code and data the host OS cannot read. Cover: the isolation mechanism (enclaves or confidential virtual machines), the memory encryption engine, the trusted computing base, measurement and launch, local and remote attestation, attestation verification services, sealed storage and key derivation, the secure world OS and trusted applications, the calls between worlds, side-channel defenses, page fault and controlled-channel attacks, enclave development SDK and partitioning, confidential containers, key release policies, firmware and microcode updates, revocation of compromised platforms, debugging restrictions. Related: hypervisor, key-management, bootloader.

### app-sandbox: Application sandbox
OS-level confinement for untrusted or semi-trusted applications. Cover: the threat model, the broker and target process split, system call filtering, filesystem namespaces and views, capability-based handles, network restrictions, IPC brokering, the policy language and profiles, entitlements, user consent prompts, portals for file pickers and devices, GPU and media access mediation, escape surfaces and hardening, crash reporting from inside the sandbox, performance cost, auditing denials, testing policies. Related: web-browser, mobile-os, container-runtime.

### system-emulator: System emulator
A full-system emulator for another machine or console. Cover: CPU emulation by interpretation, cached interpretation and dynamic recompilation, the memory map and bus, MMIO dispatch, device models (timers, interrupt controllers, storage, display, audio), cycle accuracy versus speed, scheduling devices against CPU time, graphics emulation and GPU translation, audio resampling and sync, input mapping, save states and their versioning, rewind, debugging (breakpoints, memory viewers), firmware and BIOS handling, accuracy test suites, frame pacing, multiplayer and netplay by determinism. Related: binary-translator, hypervisor, jit-compiler.

### binary-translator: Binary translator
Runs machine code from one instruction set on another. Cover: static versus dynamic translation, the decoder, the intermediate representation, translation blocks and their cache, block chaining and indirect branch handling, register mapping, condition flag emulation, memory ordering differences, self-modifying code detection, precise exceptions and signals, system call translation, floating point and SIMD differences, OS ABI translation, hot path optimization and tiering, ahead-of-time caching of translations, performance counters and profiling, correctness testing against the source machine. Related: system-emulator, jit-compiler.

### volume-manager: Volume manager & software RAID
The block layer that pools disks into volumes. Cover: physical volumes, volume groups and logical volumes, extent allocation, thin provisioning, snapshots (copy-on-write and redirect-on-write), RAID levels and their write paths, parity calculation, the write hole and journals, rebuild and resync, scrubbing, hot spares, degraded mode, device mapping layers, caching tiers (SSD in front of HDD), encryption layers, online resize and migration, metadata on disk and its redundancy, failure detection and reporting. Related: filesystem, block-storage, device-drivers.

## Languages & toolchains

### parser-generator: Parser generator
A tool that turns a grammar into a parser. Cover: the grammar language, lexer generation (regular expressions to automata), LL, LR, LALR, GLR and PEG approaches, first and follow sets, conflict detection and reporting, precedence and associativity declarations, table compression, semantic actions, syntax tree construction, error recovery strategies, incremental reparsing, generated code for several targets, grammar debugging and visualization, ambiguity handling, performance and memory of generated parsers. Related: compiler, code-formatter.

### static-analyzer: Static analyzer
Finds bugs and security issues without running code. Cover: frontends and the program model, control-flow and call graphs, data-flow analysis frameworks, abstract interpretation and lattices, pointer and alias analysis, taint tracking from sources to sinks, interprocedural summaries, path sensitivity, rule and query languages, false positive management and suppressions, baselines, incremental analysis in CI, SARIF-style result formats, IDE integration, autofix suggestions, scaling to monorepos, soundness versus precision. Related: compiler, language-server, symbolic-execution.

### code-formatter: Code formatter
Rewrites source into a canonical layout. Cover: parsing into a concrete syntax tree with comments and trivia, the document intermediate representation (groups, indents, line breaks), the line-fitting algorithm, comment attachment, preserving blank lines, configuration and why to minimize it, idempotence, stability across versions, range formatting, editor and CI integration, embedded languages, performance on large files, handling invalid code, diff noise and adoption. Related: parser-generator, language-server.

### transpiler: Transpiler
Translates source from one language or version to another. Cover: parsing, the AST, the transform pipeline and plugins, scope analysis and renaming, downleveling newer syntax, polyfills versus syntax transforms, module format conversion, type stripping, source maps, preserving comments and formatting, configuration presets by target, caching, error messages pointing to original source, interop of generated helpers, testing transforms. Related: compiler, build-system, code-formatter.

### wasm-runtime: WebAssembly runtime
Executes WebAssembly modules outside or inside a browser. Cover: binary decoding and validation, the module and instance model, linear memory and bounds checking (guard pages versus explicit checks), tables and indirect calls, imports and exports, the interpreter tier, baseline and optimizing compilers, ahead-of-time compilation and caching, the system interface for files, clocks and sockets, capability-based sandboxing, resource limits and fuel metering, threads and atomics, SIMD, garbage-collected references, the component model and interface types, host embedding API, debugging and profiling. Related: jit-compiler, bytecode-vm, app-sandbox.

### regex-engine: Regular expression engine
Compiles and runs regular expressions. Cover: the pattern parser and syntax flavors, the AST, Thompson NFA construction, lazy DFA construction and caches, backtracking execution, catastrophic backtracking and linear-time guarantees, literal optimizations and prefilters (SIMD substring search), captures and their cost, anchors, lookaround and backreferences, Unicode classes and case folding, multiline and dotall modes, compiled program size limits, streaming matching, set matching of many patterns, testing against reference engines. Related: text-editor, code-search.

### test-framework: Test framework & runner
Defines, runs and reports automated tests. Cover: test discovery, the assertion library, fixtures and setup and teardown, parametrized tests, isolation (process, module, state reset), parallel and distributed execution, sharding, ordering and randomization, timeouts, flaky test detection and retries, snapshot testing, mocking and fakes, coverage collection, watch mode and impacted-test selection, reporters and machine-readable results, plugin system, debugging failed tests. Related: build-system, ci-system.

### fuzzer: Fuzzer
Generates inputs to find crashes and bugs. Cover: harnesses, coverage instrumentation, the corpus and its minimization, mutation strategies, dictionaries and grammar-aware generation, structure-aware fuzzing, the scheduler and power schedules, sanitizers as bug oracles, crash deduplication and triage, test case minimization, persistent and in-process modes, snapshot fuzzing, parallel and distributed fuzzing, differential fuzzing, continuous fuzzing in CI, seeds and reproducibility. Related: static-analyzer, symbolic-execution, test-framework.

### symbolic-execution: Symbolic execution engine
Explores program paths with symbolic inputs. Cover: the program representation (IR or binary lifting), symbolic state and memory models, path constraints, the solver interface and query caching, path explosion and search heuristics, concolic execution, state merging, environment modeling (system calls, libraries), loops and bounds, symbolic pointers, test case generation, bug oracles, hybrid fuzzing, scalability limits, reproducing findings. Related: sat-smt-solver, fuzzer, static-analyzer.

### proof-assistant: Proof assistant
An interactive system for writing machine-checked proofs. Cover: the logical foundation (type theory or higher-order logic), the small trusted kernel, terms, types and definitional equality, elaboration and unification, implicit arguments, tactics and the tactic language, automation and decision procedures, the standard library, inductive types and recursion checking, universes, proof irrelevance, extraction to programs, the editor protocol and interactive state, incremental checking, large-library performance, notation and coercions. Related: sat-smt-solver, language-server, compiler.

### sat-smt-solver: SAT & SMT solver
Decides satisfiability of logic formulas. Cover: CNF encoding, the DPLL loop, conflict-driven clause learning, two-watched-literal propagation, decision heuristics, restarts, clause deletion, preprocessing and inprocessing, incremental solving with assumptions, proof generation and checking, the SMT architecture with theory solvers, bit-vectors, linear arithmetic, arrays and uninterpreted functions, quantifiers, the standard input language, model generation, unsat cores, portfolio and parallel solving. Related: symbolic-execution, proof-assistant.

### doc-generator: Documentation generator
Builds reference documentation from source and prose. Cover: extracting declarations and doc comments, cross-reference resolution, the doc comment markup, versioned documentation, search indexes, API diff and deprecation notices, examples that run as tests, theming and site generation, multiple languages and locales, linking to source, incremental builds, hosting and redirects, broken link checks. Related: static-site-cms, language-server.

### notebook: Computational notebook
An interactive document of code cells, outputs and prose. Cover: the document format and its diffability, the kernel protocol and kernel lifecycle, execution order and hidden state, rich outputs and MIME bundles, widgets, the front-end editor, collaboration, reproducibility and dependency capture, scheduling and parameterized runs, converting to reports and slides, large outputs and memory, security of untrusted notebooks, remote kernels and compute, versioning and review. Related: text-editor, bytecode-vm.

### code-search: Code search engine
Searches across all of an organization's code. Cover: repository ingestion and updates, trigram and n-gram indexes, regular expression search over indexes, symbol and reference indexing, cross-repository navigation, ranking, query language, filters by path, language and repository, permissions-aware results, sharding and replication, index freshness, structural and semantic search, result highlighting, scaling to billions of lines. Related: search-index, language-server, version-control.

## Browsers & the web

### ui-framework: Client-side UI framework
A framework for building interactive user interfaces in the browser. Cover: components and props, the rendering model (virtual DOM diffing versus fine-grained reactivity versus compilation), state and reactivity primitives, the scheduler and batching, effects and lifecycles, reconciliation and keys, server rendering, hydration and resumability, streaming and suspense, routing, data fetching and caching, forms, context and dependency injection, styling approaches, dev tools, error boundaries, bundle size and code splitting, the compiler step. Related: rendering-engine, web-framework.

### api-gateway: API gateway
The front door to a fleet of APIs. Cover: routing and versioning, authentication (keys, tokens, mutual TLS), authorization, rate limiting and quotas, request and response transformation, protocol translation, caching, request validation against schemas, developer onboarding and keys, usage analytics and billing, plugins, configuration distribution, high availability, logging and tracing, throttling and spike arrest, canary routing. Related: service-proxy, web-server, identity-provider.

### graph-query-server: Graph query API server
A server exposing a typed graph query language over many backends. Cover: the schema and type system, query parsing and validation, the execution engine and resolvers, batching and the N+1 problem, caching (per request, persisted queries), query cost analysis and depth limits, subscriptions, federation across services, schema evolution and deprecation, authorization at field level, error model, tracing per field, code generation for clients, introspection and tooling. Related: api-gateway, web-framework.

### web-app-firewall: Web application firewall
Inspects HTTP traffic to block attacks. Cover: deployment modes (inline, reverse proxy, edge), request normalization and decoding, the rule engine and rule language, injection and cross-site scripting detection, anomaly scoring, managed rulesets and updates, virtual patching, false positive tuning and exclusions, bot detection, rate limiting, body inspection limits, logging and sampling, learning mode, performance budgets, evasion techniques. Related: cdn, service-proxy, intrusion-detection.

### browser-automation: Headless browser automation
Drives real browsers for testing and scraping. Cover: the browser control protocol, launching and managing browser instances, contexts and isolation, the page and frame model, selectors and locators, auto-waiting and actionability, network interception and mocking, screenshots, video and traces, downloads and file uploads, multiple tabs and popups, device emulation, parallel workers, flakiness sources and mitigations, test runner integration, bot detection countermeasures by sites. Related: web-browser, test-framework.

### web-analytics: Web analytics platform
Collects and reports how people use websites. Cover: the tracking script and event schema, cookieless and consent-aware collection, ingestion endpoints and bot filtering, sessionization, identity stitching, the event pipeline and storage, aggregation and rollups, funnels, retention and cohorts, attribution, dashboards and query engine, sampling, privacy controls and data retention, ad-blocker resilience, exports. Related: columnar-database, stream-processor.

### forum-platform: Forum & community platform
Hosted discussion communities. Cover: users, profiles and trust levels, categories, threads and replies, the editor and markup, notifications and digests, search, moderation tools and queues, spam and abuse defenses, reputation and badges, private messages, real-time updates, email in and out, permissions and groups, plugins and themes, single sign-on, data export and import, caching hot threads. Related: team-chat, search-index.

### realtime-sync: Real-time sync backend
A backend that keeps client data live and in sync. Cover: the data model, subscriptions and live queries, change feeds, the sync protocol, offline clients and resync, conflict resolution (last-writer-wins, operational transforms, CRDTs), optimistic updates, authorization rules evaluated per document, presence, fan-out at scale, connection management, server functions and triggers, indexes, backups, client SDKs and caching. Related: messaging-app, document-database.

## Networking & communications

### user-space-network-stack: User-space network stack
Packet processing that bypasses the kernel. Cover: kernel bypass drivers and poll-mode drivers, NIC queues and receive-side scaling, huge pages and memory pools, zero-copy buffers, batching, run-to-completion versus pipeline models, core pinning and NUMA, the TCP/IP implementation in user space, flow classification, hardware offloads, timers, packet capture, interaction with the kernel stack, latency versus throughput, observability. Related: os-kernel, firewall.

### dns-server: DNS server
Resolves and serves domain names. Cover: the recursive resolver and its cache, the authoritative server and zones, the message format, queries over UDP and TCP, encrypted transports, delegation and glue, negative caching, signed zones and validation, zone transfers and notifications, dynamic updates, anycast deployment, rate limiting and amplification defense, query logging and privacy, split-horizon views, health-checked records, cache poisoning defenses. Related: global-traffic-manager, cdn.

### dhcp-ipam: DHCP & IP address management
Hands out addresses and tracks the address plan. Cover: the lease protocol and states, pools and scopes, reservations, options delivered to clients, relay agents, failover between servers, IPv6 address assignment modes, prefix delegation, the address inventory and subnet planning, DNS registration of leases, conflict detection, audit history, APIs for automation, scaling and lease storage. Related: dns-server, routing-daemon.

### vpn-gateway: VPN gateway
Connects networks or users over encrypted tunnels. Cover: tunnel protocols, the key exchange and rekeying, authentication (certificates, pre-shared keys, identity provider), routing and split tunneling, the virtual interface, NAT traversal, MTU and fragmentation, client configuration distribution, high availability and failover, access policies, performance and crypto offload, logging, mobile roaming. Related: firewall, zero-trust-proxy, routing-daemon.

### sdn-controller: Software-defined network controller
Centralized control of network forwarding. Cover: the network state model and topology discovery, southbound protocols to switches, flow programming and table pipelines, intent and policy compilation, path computation, overlays and virtual networks, consistency of updates across devices, the northbound API, clustering and controller high availability, telemetry ingestion, failure detection and reroute, multi-tenancy, verification of network state. Related: switch-os, routing-daemon.

### routing-daemon: Routing daemon
Runs routing protocols and installs routes. Cover: link-state protocols (flooding, shortest path computation), path-vector protocols (sessions, attributes, best path selection, policy), the routing information base and forwarding information base, route redistribution, filtering and route maps, graceful restart, fast convergence and failure detection, multipath, route reflection, multiprotocol extensions, configuration and management interfaces, scale of full routing tables, protocol security. Related: switch-os, sdn-controller.

### firewall: Firewall & packet filter
Filters and translates network traffic. Cover: the rule model and matching, rule compilation into fast lookup structures, connection tracking and state, network address translation, zones and policies, application identification, logging and counters, high availability with state sync, rule ordering and shadowing analysis, performance and hardware offload, IPv6 handling, management and change control, testing policies. Related: user-space-network-stack, vpn-gateway, intrusion-detection.

### mail-server: Mail server
Sends, receives and stores email. Cover: the transfer protocol and its extensions, the queue and retry schedules, routing and relay, sender authentication (signatures, sender policy, alignment), TLS between servers, spam filtering and reputation, virus scanning, bounces and delivery status, the mailbox store, access protocols for clients, quotas, rate limits for senders, outbound IP reputation and warm-up, logging and message tracing. Related: email-client, malware-scanner.

### email-client: Email client
Reads, organizes and sends email. Cover: account setup and server discovery, the sync protocol and incremental sync, the local cache and offline mode, threading and conversations, search and indexing, rendering untrusted HTML safely, remote content blocking, attachments, composing and rich text, drafts and outbox, rules and labels, multiple accounts, push notifications, encryption and signing, contacts and autocomplete. Related: mail-server, messaging-app.

### voip-pbx: VoIP & PBX
Business telephony over IP. Cover: signaling protocol and dialogs, registration and endpoints, media transport and codecs, NAT traversal, the dial plan and call routing, call features (hold, transfer, conference, voicemail), interactive voice response, queues and call centers, trunks to the phone network, media servers and mixing, emergency calling, call recording, security and toll fraud, quality monitoring (jitter, loss), scaling. Related: video-conferencing, media-pipeline.

### video-conferencing: Video conferencing system
Multi-party real-time audio and video meetings. Cover: signaling and room state, the media transport, selective forwarding units versus mixing, simulcast and scalable coding, bandwidth estimation and congestion control, jitter buffers, echo cancellation and noise suppression, active speaker detection, screen sharing, recording, end-to-end encryption, large meetings and webinars, geographic media routing, quality metrics, chat and reactions. Related: media-pipeline, voip-pbx, messaging-app.

### team-chat: Team chat platform
Workplace messaging. Cover: workspaces, channels and direct messages, the message store and ordering, real-time delivery over persistent connections, presence and typing, threads, reactions and mentions, notifications and their rules, search, file sharing, integrations, bots and webhooks, permissions and guests, retention and legal hold, enterprise identity, unread state across devices, scaling large channels. Related: messaging-app, forum-platform.

### p2p-file-sharing: Peer-to-peer file sharing
Distributes files among peers without a central server. Cover: content addressing and metadata files, peer discovery (trackers, distributed hash tables, peer exchange), the wire protocol, piece selection (rarest first, endgame), choking and incentive mechanisms, NAT traversal, integrity verification, bandwidth management, seeding and swarm health, magnet links, encryption, web seeds, client storage and preallocation. Related: dht-overlay, distributed-filesystem.

## Data & storage

### distributed-filesystem: Distributed filesystem
A filesystem spread over many servers. Cover: the namespace and metadata service, scaling metadata, data placement and chunks or stripes, replication and erasure coding, client caching and consistency semantics, leases and locks, POSIX compatibility, recovery and re-replication, rebalancing, failure domains, snapshots, quotas, small file problems, rolling upgrades, monitoring. Related: object-storage, block-storage, filesystem.

### object-storage: Object storage service
Stores immutable objects behind a bucket and key API. Cover: the API (put, get, list, multipart upload), the metadata index, data placement, erasure coding and durability math, consistency model, versioning, lifecycle rules and tiering, replication across regions, encryption, access policies, presigned URLs, small objects and packing, garbage collection, background repair, listing at scale. Related: distributed-filesystem, lakehouse-format.

### graph-database: Graph database
Stores nodes and relationships and runs traversals. Cover: the property graph model, native adjacency storage versus tables, indexes on properties, the query language and pattern matching, the query planner for traversals, transactions, path algorithms, graph analytics, supernodes, sharding graphs, schema and constraints, import pipelines, caching, visualization. Related: relational-database, distributed-sql.

### document-database: Document database
Stores schemaless JSON-like documents. Cover: the document model and binary encoding, collections, primary keys, secondary indexes including arrays and text, the query language and aggregation pipeline, the storage engine, write concerns and read concerns, replication with replica sets, elections, sharding and chunk balancing, schema validation, transactions across documents, change streams, TTL indexes, backups. Related: key-value-store, relational-database.

### columnar-database: Columnar analytics database
An analytical database storing data by column. Cover: columnar file layout, encodings and compression, sparse indexes and min-max pruning, vectorized execution, late materialization, parallel scans, aggregation algorithms, joins at scale, data skipping, materialized views and projections, ingestion and merges, sharding and replication, approximate functions, query cost control. Related: data-warehouse, relational-database.

### data-warehouse: Data warehouse
A managed analytics platform with separated storage and compute. Cover: storage on object storage, micro-partitions and metadata, compute clusters and isolation, the query optimizer, result caching, materialized views, data loading and continuous ingestion, semi-structured data, time travel and cloning, data sharing, workload management, access control and masking, cost governance, transformations and orchestration integration. Related: columnar-database, lakehouse-format.

### distributed-sql: Distributed SQL database
A horizontally scalable SQL database with ACID transactions. Cover: range or hash sharding, the per-shard consensus groups, the distributed transaction protocol, timestamps and clock uncertainty, isolation guarantees, distributed query planning, leaseholders and follower reads, rebalancing and splits, schema changes online, multi-region placement, survivability goals, the SQL layer over a key-value core, observability of contention. Related: relational-database, consensus-service.

### vector-database: Vector database
Stores embeddings and answers similarity queries. Cover: vector storage formats, distance metrics, exact search, approximate indexes (graph-based, inverted-file, quantization), index build and update costs, filtering with metadata, hybrid lexical and vector search, recall versus latency tuning, sharding and replication, memory versus disk indexes, reindexing and model versioning, multi-tenancy, batching queries. Related: search-index, rag-system.

### lakehouse-format: Lakehouse table format
A table format that gives files on object storage database semantics. Cover: data files and columnar formats, the metadata tree (snapshots, manifests), atomic commits and optimistic concurrency, schema evolution, partition evolution and hidden partitioning, time travel, row-level deletes and merge-on-read versus copy-on-write, compaction, snapshot expiry, the catalog, engine interoperability, statistics for pruning. Related: object-storage, data-warehouse, batch-processing.

### workflow-orchestrator: Workflow orchestrator
Schedules and runs data and batch pipelines. Cover: DAG definitions, the scheduler, executors and workers, task state and retries, dependencies and sensors, backfills and catchup, parameterization, data-aware scheduling, the metadata database, logs, SLAs and alerting, concurrency limits and pools, secrets, versioning pipelines, the UI. Related: batch-processing, durable-workflows.

### batch-processing: Batch processing engine
Processes large datasets in parallel across a cluster. Cover: the dataset abstraction and lineage, lazy evaluation and the logical plan, the optimizer, stages and tasks, the shuffle, partitioning and skew, memory management and spilling, caching, fault tolerance by recomputation, the scheduler and speculative execution, data sources and formats, the SQL layer, dynamic resource allocation. Related: stream-processor, lakehouse-format.

### change-data-capture: Change data capture pipeline
Streams database changes to other systems. Cover: reading the database log, snapshots and the initial load, ordering and transaction boundaries, schema changes, the change event format, delivery guarantees, offsets and resuming, sinks, filtering and transforms, handling deletes, backpressure, monitoring lag, high availability. Related: message-queue, relational-database.

### backup-system: Backup & archival system
Protects data with backups and long-term archives. Cover: backup agents and snapshots, full, incremental and synthetic full backups, chunking and deduplication, compression and encryption, the catalog, retention policies and legal hold, immutability against ransomware, offsite and cloud tiers, restore paths (file, volume, bare metal), restore testing, scheduling and throttling, verification, reporting. Related: object-storage, volume-manager.

### bi-dashboards: BI & dashboard tool
Business intelligence dashboards and exploration. Cover: data source connections, the semantic layer and metrics definitions, query generation, caching and extracts, the visualization library, dashboards and filters, drill-down, scheduled reports and alerts, permissions and row-level security, embedding, natural language queries, version control of definitions, performance on large data. Related: data-warehouse, columnar-database.

## Distributed systems & infrastructure

### serverless-platform: Serverless function platform
Runs functions on demand without managed servers. Cover: function packaging, the invocation path, event sources and triggers, isolation (micro virtual machines, isolates), cold starts and warm pools, scaling to zero and concurrency limits, the placement scheduler, state and connections, timeouts, retries and dead letters, logs and traces, configuration and secrets, billing by duration, versions and aliases. Related: cluster-orchestrator, hypervisor.

### cloud-control-plane: Cloud control plane
The API and management layer of an infrastructure cloud. Cover: the resource model and APIs, identity and access control, accounts and tenancy, quotas and limits, regions and availability zones, the request pipeline and asynchronous operations, placement of virtual machines, networking virtualization (virtual networks, security groups), storage provisioning, metering and billing, the cell architecture and blast radius, deployments of the control plane itself, audit logs. Related: hypervisor, block-storage, cluster-orchestrator.

### block-storage: Block storage service
Network-attached virtual disks. Cover: the volume model, the data path from host to storage nodes, replication and consistency, chunk placement, snapshots and clones, volume attach and detach, performance tiers and IOPS limits, encryption, failure recovery and re-replication, multi-attach, live migration, client drivers, latency management. Related: volume-manager, distributed-filesystem, cloud-control-plane.

### durable-workflows: Durable workflow engine
Runs long-lived code that survives failures by event sourcing. Cover: workflow and activity definitions, the event history, deterministic replay, the workers and task queues, timers, signals and queries, retries and timeouts, versioning workflows safely, child workflows, the persistence layer, sharding the history service, visibility and search, sagas and compensation. Related: workflow-orchestrator, message-queue.

### actor-runtime: Actor runtime
A runtime for actors that communicate by messages. Cover: actors, mailboxes and message ordering, the scheduler, supervision trees and restart strategies, location transparency and remoting, cluster membership, sharding and virtual actors, persistence and event sourcing, backpressure, timers, failure detection, serialization, testing. Related: durable-workflows, rpc-framework.

### hpc-scheduler: HPC batch scheduler
Schedules jobs on a supercomputer or research cluster. Cover: job submission and scripts, partitions and queues, priority and fair-share, backfill scheduling, gang scheduling for parallel jobs, node allocation and topology awareness, GPUs and generic resources, reservations, accounting, job arrays, preemption, the node daemon and launch, health checks, the controller database. Related: cluster-orchestrator, training-platform.

### rpc-framework: RPC framework
Remote procedure calls between services. Cover: the interface definition language, code generation, serialization, the transport, connection management and multiplexing, streaming calls, deadlines and cancellation, metadata, errors and status codes, retries and idempotency, load balancing on the client, interceptors, compression, reflection and tooling, versioning and compatibility. Related: service-proxy, actor-runtime.

### chaos-engineering: Chaos engineering platform
Injects faults to test resilience. Cover: experiment definitions and hypotheses, fault types (latency, errors, resource exhaustion, node loss), targeting and blast radius, scheduling, safety guards and automatic abort, steady-state metrics, game days, injection mechanisms (agents, proxies, kernel), reporting, integration with CI. Related: service-proxy, observability-stack.

### config-management: Configuration management system
Keeps fleets of machines in a desired state. Cover: the configuration language, resources and providers, idempotence and convergence, push versus pull, the agent, inventories and facts, templating, ordering and dependencies, secrets, dry runs, drift detection, roles and modules, reporting, scaling to many nodes. Related: infrastructure-as-code, init-system.

### global-traffic-manager: Global traffic manager
Steers users to healthy regions and data centers. Cover: DNS-based steering, anycast, geolocation and latency measurement, health checks, failover policies, weighted and gradual shifts, session affinity, capacity awareness, real-user measurements, propagation delays and TTLs, integration with load balancers, testing failovers. Related: dns-server, cdn, service-proxy.

### dht-overlay: Distributed hash table overlay
A peer-to-peer key-based routing layer. Cover: the identifier space and distance metric, routing tables and buckets, lookup procedure, joining and leaving, churn handling, replication of values, NAT traversal, security attacks (Sybil, eclipse) and defenses, bootstrapping, key expiry and republishing, latency optimizations. Related: p2p-file-sharing, blockchain-node.

### blockchain-node: Blockchain node
A full node of a public blockchain network. Cover: the peer-to-peer gossip network, transaction format and validation, the mempool, block production and consensus (proof of work or stake), fork choice, the state database and its commitments, the execution environment for contracts, syncing (full, snapshot, light), pruning, the RPC interface, fees and resource accounting, finality, upgrades and hard forks. Related: dht-overlay, consensus-service.

## Developer platforms & DevOps

### ci-system: Continuous integration system
Builds and tests every change. Cover: pipeline definitions, triggers, the scheduler, runners and executors, isolation of jobs, caching dependencies and build outputs, artifacts, matrices, secrets handling, logs and live output, test reporting, concurrency and queuing, flaky test handling, autoscaling runners, security of untrusted code, status reporting to code review. Related: build-system, test-framework, code-review.

### progressive-delivery: Deployment & progressive delivery
Ships changes to production safely. Cover: release artifacts and environments, deployment strategies (rolling, blue-green, canary), traffic shifting, automated analysis of metrics, rollback, approval gates, deployment freezes, configuration and secrets delivery, database migrations, multi-region rollout waves, GitOps reconciliation, audit trail. Related: ci-system, feature-flags, cluster-orchestrator.

### artifact-repository: Artifact repository
Stores and serves build outputs and dependencies. Cover: repository formats for many package types, hosted, proxy and virtual repositories, storage and deduplication, metadata indexes, access control, retention and cleanup, promotion between stages, immutability, replication, vulnerability scanning integration, search, high availability. Related: package-manager, ci-system.

### code-review: Code review platform
Reviews proposed changes before merge. Cover: change sets and revisions, diff computation and display, inline comments and threads, reviewers and code owners, approvals and rules, status checks, merge strategies, rebasing, suggestions, notifications, large diffs, stacked changes, review analytics. Related: code-forge, ci-system, version-control.

### code-forge: Code hosting forge
Hosts repositories and collaboration around them. Cover: repository storage and replication, the git-protocol server, permissions and teams, the web interface, pull or merge requests, issues, webhooks and apps, search, wikis and pages, forks, mirroring, large-file storage, audit logs, scaling hot repositories. Related: version-control, code-review, ci-system.

### feature-flags: Feature flag service
Turns features on for chosen users at runtime. Cover: flag definitions and variants, targeting rules and segments, percentage rollouts and consistent bucketing, SDKs and local evaluation, streaming updates, fallbacks when the service is down, experiments, audit history, flag lifecycle and cleanup, environments, permissions. Related: progressive-delivery, experiment-tracker.

### error-tracking: Error tracking service
Collects and groups application errors. Cover: SDKs and capture, breadcrumbs and context, ingestion and rate limiting, symbolication and source maps, fingerprinting and grouping, deduplication, issue lifecycle, alerting rules, release tracking and regressions, sampling, data scrubbing, storage and search. Related: observability-stack, debugger-profiler.

### issue-tracker: Issue tracker
Tracks work items through workflows. Cover: the item model and custom fields, workflows and states, boards and backlogs, queries and filters, hierarchy and links, notifications, permissions, automation rules, search, reporting, integrations with code, imports, scaling. Related: code-forge, knowledge-base.

### api-client: API client & testing tool
Sends, saves and tests API requests. Cover: request building, environments and variables, collections, authentication helpers, scripting before and after requests, assertions, mock servers, schema import, collaboration and sharing, history, running collections in CI, secrets handling. Related: api-gateway, test-framework.

### load-testing: Load testing tool
Generates traffic to measure system capacity. Cover: workload models (open versus closed), scenarios and virtual users, protocol clients, distributed load generators, timing and coordinated omission, ramp profiles, think time, data parameterization, metrics collection and percentiles, thresholds, result reporting, correlation with server metrics. Related: observability-stack, chaos-engineering.

### developer-portal: Developer portal
A catalog of services and the paved road for building them. Cover: the software catalog and entity model, ownership, API documentation, templates and scaffolding, scorecards and standards, search, plugins, integrations with CI and on-call, technical documentation, permissions. Related: code-forge, observability-stack.

### dependency-scanner: Dependency vulnerability scanner
Finds known-vulnerable dependencies. Cover: manifest and lockfile parsing, software bills of materials, the advisory database and matching, version range semantics, reachability analysis, severity scoring, license compliance, container image scanning, automated upgrade pull requests, policies and gates, noise reduction. Related: package-manager, supply-chain-signing.

## Security & identity

### identity-provider: Identity provider
Authenticates users and issues identity tokens. Cover: user directory and federation, sign-in flows, passwords and their storage, multi-factor and passkeys, sessions, the authorization-code and other token flows, token formats and signing keys, key rotation, single sign-on and logout, consent, risk-based authentication, account recovery, provisioning to other apps, audit, rate limits against credential stuffing. Related: authz-policy-engine, zero-trust-proxy.

### authz-policy-engine: Authorization policy engine
Decides who may do what. Cover: policy models (role-based, attribute-based, relationship-based), the policy language, the decision API, the relationship store, consistency and new-enemy problems, caching decisions, policy distribution, auditing decisions, testing policies, performance at scale, administration. Related: identity-provider, api-gateway.

### secrets-manager: Secrets manager
Stores and issues secrets to software. Cover: the encrypted storage backend, unsealing, authentication of machines and workloads, access policies, dynamic secrets and leases, rotation, encryption as a service, audit logging, replication, high availability, secret injection into workloads, break-glass access. Related: key-management, identity-provider.

### certificate-authority: Certificate authority
Issues and revokes certificates. Cover: the key hierarchy and offline roots, certificate profiles, validation of requesters, automated issuance protocols, signing infrastructure, hardware security modules, revocation lists and online status, certificate transparency logging, short-lived certificates, internal versus public authorities, audits, incident response. Related: key-management, identity-provider.

### password-manager: Password manager
Stores and fills credentials for a person or team. Cover: the vault format and encryption, key derivation from the master password, zero-knowledge sync, sharing and organizations, autofill and phishing resistance, browser extensions, generation, breach monitoring, passkeys, emergency access, recovery, audit. Related: identity-provider, key-management.

### key-management: Key management service
Manages cryptographic keys for other services. Cover: key hierarchy and envelope encryption, hardware security modules, key generation and import, key policies, rotation and versions, encrypt, decrypt and sign APIs, audit, regional isolation, deletion and recovery windows, multi-tenant isolation, performance and caching of data keys. Related: secrets-manager, certificate-authority.

### intrusion-detection: Intrusion detection system
Detects attacks in network traffic. Cover: packet capture and reassembly, protocol parsing, signature rules and their language, anomaly detection, flow records, encrypted traffic analysis, alert generation and tuning, performance at line rate, deployment as tap or inline, rule updates, integration with SIEM. Related: firewall, siem.

### siem: Security information & event management
Collects security telemetry and detects threats. Cover: log collection and parsing, normalization into a common schema, storage and retention, the detection rule language, correlation, threat intelligence enrichment, alert triage and cases, investigations and search, response playbooks, user behavior analytics, compliance reporting, cost of ingest. Related: observability-stack, edr-agent.

### edr-agent: Endpoint detection & response
An agent on each machine that detects and responds to attacks. Cover: kernel and user-space sensors, process, file and network telemetry, behavioral detections, local prevention, isolation of a host, response actions, tamper protection, the agent update channel, cloud analytics, performance budgets, offline operation, forensics collection. Related: malware-scanner, siem.

### malware-scanner: Malware scanner
Identifies malicious files. Cover: file type detection, unpacking and decompression, signature matching, heuristics and emulation, machine-learning classifiers, sandbox detonation, scanning on access and on demand, update distribution, false positive handling, quarantine, performance. Related: edr-agent, mail-server.

### vulnerability-scanner: Vulnerability scanner
Finds known weaknesses in hosts and applications. Cover: asset discovery, port and service scanning, authenticated checks, the vulnerability check library, web application scanning, scheduling and throttling, risk scoring, deduplication across scans, remediation tracking, reporting, safe scanning of fragile systems. Related: dependency-scanner, siem.

### zero-trust-proxy: Zero-trust access proxy
Grants access per request instead of by network location. Cover: identity-aware proxying, device posture checks, policies per application, session handling, the connector or tunnel to private apps, client agents, continuous evaluation, logging, integration with the identity provider, high availability, user experience on denial. Related: identity-provider, vpn-gateway, authz-policy-engine.

### supply-chain-signing: Software supply-chain signing
Proves where software artifacts came from. Cover: signing artifacts and images, keyless signing with short-lived certificates, transparency logs, build provenance attestations, verification policies at deploy time, bills of materials, reproducible builds, key management for signers, admission control, revocation. Related: certificate-authority, ci-system, dependency-scanner.

## AI & ML systems

### llm-inference-server: LLM inference server
Serves large language models with high throughput. Cover: model loading and sharding across accelerators, tensor and pipeline parallelism, the request scheduler, continuous batching, the key-value cache and its paging, prefix caching, prefill versus decode, speculative decoding, quantization, sampling and structured output, streaming responses, tool calling, multi-model and adapter serving, autoscaling, metrics (time to first token, throughput). Related: ml-framework, training-platform.

### training-platform: Distributed training platform
Runs large training jobs on accelerator clusters. Cover: job specification, scheduling and gang allocation, the data pipeline at scale, parallelism strategies, collective communication and network topology, checkpointing and resumption, fault detection and elastic restarts, experiment configuration, hyperparameter sweeps, monitoring loss and hardware health, storage throughput, cost accounting. Related: ml-framework, hpc-scheduler, experiment-tracker.

### feature-store: Feature store
Manages features for training and serving. Cover: feature definitions and registry, offline store, online store, materialization jobs, point-in-time correct joins, streaming features, freshness and backfills, serving APIs and latency, training-serving skew, versioning, monitoring feature drift, access control. Related: stream-processor, data-warehouse.

### experiment-tracker: Experiment tracker & model registry
Records experiments and manages model versions. Cover: runs, parameters and metrics logging, artifacts, comparison views, lineage to data and code, the model registry, stages and promotion, approval workflows, model cards, reproducibility, storage, APIs and integrations. Related: training-platform, feature-flags.

### recommender-system: Recommender system
Chooses what to show each user. Cover: event collection, candidate generation (collaborative filtering, embeddings, retrieval), filtering, ranking models and features, re-ranking for diversity and business rules, exploration, real-time features, offline evaluation, online experiments, feedback loops and popularity bias, cold start, serving latency. Related: feature-store, social-feed.

### speech-recognition: Speech recognition system
Turns audio into text. Cover: audio capture and preprocessing, voice activity detection, feature extraction, the acoustic model, decoding and beam search, language model integration, streaming versus batch, endpointing, punctuation and formatting, speaker diarization, custom vocabulary, confidence scores, word error rate evaluation, on-device versus server. Related: speech-synthesis, conversational-assistant.

### speech-synthesis: Speech synthesis system
Turns text into natural speech. Cover: text normalization, pronunciation and lexicons, prosody prediction, the acoustic model, the vocoder, streaming synthesis and latency, voices and voice cloning safeguards, markup for control, multilingual support, quality evaluation, caching. Related: speech-recognition, conversational-assistant.

### document-ocr: Document OCR & understanding
Extracts text and structure from scanned documents. Cover: image preprocessing, text detection, recognition, layout analysis, reading order, table extraction, form field extraction, handwriting, key-value pairing, document classification, confidence and human review, output formats, evaluation. Related: vision-pipeline, data-labeling.

### vision-pipeline: Computer vision pipeline
Processes camera streams with ML models. Cover: capture and decoding, preprocessing, inference scheduling and batching, detection, segmentation and tracking, post-processing, model optimization for edge devices, accelerators, event generation, privacy, annotation feedback, monitoring accuracy, deployment to fleets. Related: media-pipeline, autonomous-driving.

### autonomous-driving: Autonomous driving stack
Software that drives a vehicle. Cover: sensors (camera, lidar, radar) and calibration, time synchronization, localization and maps, perception and sensor fusion, tracking, prediction of other agents, planning, control, the safety supervisor and fallbacks, the vehicle interface, simulation and scenario testing, data logging and fleet learning, functional safety and validation. Related: robotics-middleware, vision-pipeline, automotive-platform.

### agent-framework: AI agent framework
Builds applications where a language model plans and calls tools. Cover: the agent loop, prompts and context assembly, tool definitions and calling, structured outputs, memory (short-term, long-term, retrieval), planning and decomposition, multi-agent coordination, state and checkpoints, human approval steps, sandboxed code execution, guardrails and permission boundaries, evaluation and tracing, cost and latency budgets, error recovery. Related: llm-inference-server, rag-system.

### rag-system: Retrieval-augmented generation system
Answers questions grounded in a document collection. Cover: ingestion and parsing, chunking strategies, embeddings, the index (vector and lexical), query rewriting, retrieval and hybrid search, re-ranking, context assembly, citation and grounding, freshness and updates, access control on documents, evaluation of retrieval and answers, hallucination defenses. Related: vector-database, search-index, agent-framework.

### data-labeling: Data labeling platform
Produces labeled data for training. Cover: task design and ontologies, the annotation interfaces, workforce management, task routing, consensus and adjudication, quality metrics and gold questions, model-assisted labeling, active learning, versioned datasets, export formats, privacy, cost tracking. Related: document-ocr, training-platform.

### conversational-assistant: Conversational assistant
A chat or voice assistant that completes tasks. Cover: channels, speech in and out, natural language understanding or LLM, dialogue state, intents and slot filling, actions and integrations, knowledge grounding, personalization, handoff to humans, safety and content filters, analytics, testing conversations. Related: agent-framework, speech-recognition.

## Embedded, real-time & hardware

### robotics-middleware: Robotics middleware
Connects the processes of a robot. Cover: nodes, publish-subscribe topics, services and actions, the discovery and transport layer, message definitions, quality-of-service settings, coordinate transforms, timing and clocks, launch and lifecycle, recording and playback, simulation integration, real-time constraints, security. Related: flight-controller, autonomous-driving.

### flight-controller: Flight controller
Keeps a drone or aircraft stable and on course. Cover: sensors (IMU, barometer, GNSS, magnetometer), sensor fusion and state estimation, control loops (rate, attitude, position), motor mixing, flight modes, mission and waypoint execution, failsafes, the radio link and telemetry, parameter tuning, logging, real-time scheduling, hardware abstraction. Related: real-time-os, robotics-middleware.

### automotive-platform: Automotive software platform
The software architecture of a modern vehicle. Cover: electronic control units and zonal architecture, vehicle buses, the classic and adaptive platform layers, communication middleware, diagnostics, over-the-air updates, functional safety processes, cybersecurity, the hypervisor in the cockpit, infotainment, time synchronization, calibration, software-defined vehicle services. Related: real-time-os, autonomous-driving.

### industrial-control: Industrial control & SCADA
Controls physical processes in plants and utilities. Cover: programmable controllers and scan cycles, I/O, fieldbus and industrial protocols, the supervisory layer, HMIs, alarms, the historian, recipes and batches, safety instrumented systems, redundancy, network segmentation and security, engineering tools, change management. Related: real-time-os, digital-twin.

### iot-fleet: IoT fleet platform
Manages millions of connected devices. Cover: device identity and provisioning, connectivity protocols, the message broker, device shadows or twins, telemetry ingestion, commands, over-the-air firmware updates and rollback, fleet grouping, monitoring and alerts, security and certificate rotation, offline devices, edge gateways. Related: message-queue, time-series-database.

### smart-home-hub: Smart home hub
Coordinates home devices locally. Cover: radio protocols, device pairing and commissioning, the device model, local automation engine, scenes, voice assistant integration, cloud connectivity and local fallback, user accounts and sharing, firmware updates, energy management, security and privacy. Related: iot-fleet, conversational-assistant.

### hdl-simulator: Hardware description simulator
Simulates digital hardware designs. Cover: parsing hardware description languages, elaboration, the event-driven simulation kernel, delta cycles, cycle-based simulation, compiled simulation, four-state logic, waveform dumping, testbenches and verification languages, assertions, coverage, co-simulation, performance on large designs. Related: fpga-toolchain, compiler.

### fpga-toolchain: FPGA synthesis toolchain
Turns hardware descriptions into an FPGA bitstream. Cover: synthesis to a netlist, technology mapping, optimization, placement, routing, timing analysis and closure, constraints, IP cores, high-level synthesis, bitstream generation, incremental compilation, debugging on hardware, reports. Related: hdl-simulator, pcb-design.

### pcb-design: PCB & electronics design tool
Designs circuit boards. Cover: schematic capture, symbols and footprints, component libraries, netlists, board layout, layer stack, routing (manual and automatic), design rule checks, signal integrity, 3D models, manufacturing outputs, bill of materials, version control of designs, simulation hooks. Related: fpga-toolchain, mechanical-cad.

### satellite-flight-software: Satellite flight software
Runs a spacecraft. Cover: the flight computer and RTOS, command and data handling, telemetry, the software bus, attitude determination and control, power and thermal management, payload control, fault detection, isolation and recovery, safe modes, onboard scheduling, ground commanding, software uploads in flight, radiation effects. Related: real-time-os, flight-controller.

### vehicle-navigation: In-vehicle navigation system
Guides a driver to a destination. Cover: positioning and sensor fusion, map data and its formats, map matching, routing algorithms with traffic, rerouting, guidance and lane-level instructions, search for places, map rendering, offline maps and updates, traffic data ingestion, voice guidance. Related: map-routing, automotive-platform.

### digital-twin: Digital twin platform
Keeps a live model of physical assets. Cover: the asset model and hierarchy, sensor data ingestion, synchronization of state, simulation models, what-if analysis, visualization in 3D, anomaly detection, predictive maintenance, historical replay, integration with control systems, data quality. Related: industrial-control, iot-fleet.

## Creative & media tools

### modeling-3d: 3D modeling tool
Creates and edits 3D models. Cover: mesh data structures (half-edge, polygons), modifiers and the modifier stack, sculpting, UV mapping, materials, the scene and object hierarchy, the viewport renderer, selection and tools, undo, file formats, animation rigs, scripting and add-ons, performance on large meshes. Related: path-tracer, game-engine.

### path-tracer: Offline path-tracing renderer
Renders photorealistic images. Cover: scene description, acceleration structures, ray-surface intersection, materials and BSDFs, light transport and Monte Carlo integration, importance sampling, light sampling, volumes, textures, camera models, denoising, progressive and bucket rendering, GPU rendering, render farms. Related: graphics-renderer, modeling-3d.

### vfx-compositor: VFX compositor
Combines rendered and filmed elements into final frames. Cover: the node graph, image formats and channels, deep compositing, color pipelines, keying, roto, tracking, transforms and filtering, caching, multi-resolution proxies, scripting, render farm submission, review. Related: video-editor, image-processing.

### audio-workstation: Digital audio workstation
Records, edits and mixes audio. Cover: the audio engine and graph, the real-time thread and buffers, plugin hosting and isolation, latency compensation, MIDI, the timeline and clips, automation, mixing and buses, recording, time stretching, project files, rendering and export, device drivers. Related: media-pipeline, real-time-os.

### video-editor: Non-linear video editor
Edits video on a timeline. Cover: media import and decoding, proxies, the timeline model, playback engine, effects and transitions, color correction, audio editing, titles, rendering and export queues, GPU acceleration, project files and autosave, collaboration, media management. Related: media-pipeline, vfx-compositor.

### live-streaming: Live video streaming platform
Broadcasts live video to many viewers. Cover: ingest protocols, transcoding ladders, packaging, origin and CDN delivery, latency modes, player and adaptive bitrate, chat and interactivity, recording and clipping, moderation, monetization, monitoring stream health, scaling for spikes. Related: media-pipeline, cdn.

### music-streaming: Music streaming service
Streams a music catalog to listeners. Cover: catalog ingestion and metadata, rights and licensing rules, audio encoding, delivery and caching, offline downloads and DRM, the player, playlists, search, recommendations, royalties reporting, social features, scaling. Related: media-pipeline, recommender-system.

### xr-runtime: VR & AR runtime
Drives virtual and augmented reality headsets. Cover: tracking (inside-out, controllers, hands, eyes), sensor fusion, the compositor, reprojection and timewarp, motion-to-photon latency, lens distortion correction, foveated rendering, the runtime API for applications, passthrough and scene understanding, spatial anchors, input, comfort and performance budgets. Related: graphics-renderer, window-compositor.

### text-shaping: Text shaping & font rendering
Turns text into positioned glyphs and pixels. Cover: font file parsing, character to glyph mapping, shaping rules for complex scripts, bidirectional text, line breaking, font fallback, hinting, rasterization and antialiasing, subpixel rendering, glyph caches and atlases, variable fonts, color fonts and emoji, vertical text, performance. Related: rendering-engine, window-compositor.

### image-processing: Image processing library
Decodes, transforms and encodes images. Cover: codecs, pixel formats and color spaces, color management, tiling and streaming of large images, the operation pipeline, resampling filters, convolutions, SIMD and GPU acceleration, memory management, metadata, animation, security of decoders, batch processing. Related: media-pipeline, vfx-compositor.

### map-routing: Map rendering & routing service
Serves maps and directions. Cover: map data ingestion, the tile pyramid and vector tiles, styling and rendering, geocoding and search, the road graph, routing algorithms (contraction hierarchies, A*), traffic data, turn costs and restrictions, travel time estimation, isochrones, offline maps, update pipelines. Related: vehicle-navigation, search-index.

### mechanical-cad: Mechanical CAD
Designs mechanical parts and assemblies. Cover: the geometric kernel (boundary representation), parametric features, sketches and constraint solving, the feature history, assemblies and mates, drawings, tolerances, file exchange formats, simulation hooks, version management, collaboration, performance on large assemblies. Related: pcb-design, modeling-3d.

## Applications & domain software

### ecommerce-platform: E-commerce platform
Runs online stores. Cover: the product catalog and variants, search and browse, pricing and promotions, the cart, checkout, payments integration, taxes, inventory and reservations, order management, fulfillment and shipping, customer accounts, reviews, multi-currency and multi-region, the storefront and headless APIs, peak traffic handling, fraud checks. Related: payment-processor, warehouse-management.

### payment-processor: Payment processor
Moves money for merchants. Cover: payment methods, tokenization and card data security, authorization and capture, the card network messages, idempotency keys, the double-entry ledger, settlement and payouts, refunds and disputes, fraud scoring, currency conversion, reconciliation, webhooks, compliance scope reduction, high availability. Related: core-banking, ecommerce-platform.

### core-banking: Core banking system
The system of record for a bank's accounts. Cover: customers and accounts, products and interest, the double-entry general ledger, posting and balances, payments in and out, end-of-day batch, statements, loans and schedules, fees, regulatory reporting, audit and immutability, availability, migrations from legacy cores. Related: payment-processor, erp-accounting.

### matching-engine: Exchange matching engine
Matches buy and sell orders on an exchange. Cover: order types, the order book data structure, price-time priority, the matching loop, determinism and sequencing, market data publication, risk checks before matching, the gateway, persistence and replay, failover with hot standby, latency engineering, auctions, circuit breakers, regulatory audit trails. Related: payment-processor, message-queue.

### point-of-sale: Point-of-sale system
Checks out customers in a store. Cover: the register app, the catalog and prices, barcode scanning, peripherals (printers, drawers, card readers), payments, offline mode and sync, receipts, returns, discounts, inventory updates, shift and cash management, multi-store, reporting. Related: payment-processor, ecommerce-platform.

### erp-accounting: ERP & accounting system
Runs a company's finance and operations. Cover: the chart of accounts, journals and the general ledger, accounts payable and receivable, invoicing, purchasing, inventory valuation, multi-currency and multi-entity, period close and consolidation, tax, reporting, approvals and controls, audit trail, integrations. Related: core-banking, crm.

### crm: CRM
Manages customer relationships. Cover: contacts, accounts and leads, the sales pipeline, activities and email sync, customization of objects and fields, workflow automation, forecasting, reporting, permissions and sharing, integrations, marketing handoff, mobile, data quality and deduplication. Related: erp-accounting, knowledge-base.

### booking-system: Booking & reservation system
Sells limited inventory in time slots. Cover: the inventory model (rooms, seats, appointments), availability search, holds and expiry, confirmation, overbooking policies, pricing and rules, cancellations, payments, channel distribution and sync, double-booking prevention, waitlists, notifications. Related: payment-processor, ecommerce-platform.

### ride-hailing: Ride-hailing dispatch
Matches riders with drivers. Cover: live location ingestion, the geospatial index, supply and demand forecasting, dispatch and matching, ETA estimation, pricing and surge, trip state machine, routing, payments, ratings and safety, driver incentives, fraud. Related: map-routing, payment-processor.

### warehouse-management: Warehouse management system
Runs a warehouse. Cover: locations and slotting, receiving, putaway, inventory tracking, order release and waves, picking strategies, packing, shipping, cycle counts, labor management, automation and robotics integration, carrier integration, returns. Related: ecommerce-platform, erp-accounting.

### ad-exchange: Ad exchange & real-time bidding
Auctions ad impressions in milliseconds. Cover: ad requests, the bid request format, bidders, the auction (first and second price), floors, timeouts, user matching and privacy, targeting, budget pacing, frequency capping, creative rendering and verification, fraud detection, reporting and billing. Related: recommender-system, web-analytics.

### social-feed: Social network feed
Builds each user's feed. Cover: the social graph, posts and media, fan-out on write versus read, the feed store, ranking, real-time updates, notifications, privacy controls, moderation, celebrity accounts, caching, counters, search. Related: recommender-system, graph-database.

### video-sharing: Video sharing platform
Hosts user-uploaded video. Cover: upload, transcoding, storage tiers, delivery and CDN, the player, metadata and search, recommendations, comments, moderation and copyright matching, live, monetization, analytics, scaling. Related: media-pipeline, live-streaming, recommender-system.

### knowledge-base: Note-taking & knowledge base
Personal or team notes and wiki. Cover: the block-based document model, editing, links and backlinks, databases and properties, search, sync and offline, collaboration, permissions, templates, import and export, version history, embeds, plugins. Related: text-editor, realtime-sync.

### learning-management: Learning management system
Runs courses and training. Cover: courses and modules, content packages and standards, enrollment, assignments and submissions, quizzes and grading, gradebook, discussions, calendars, video, accessibility, analytics, integrations through interoperability standards, certificates. Related: video-sharing, forum-platform.

### health-records: Electronic health records
The clinical record system of a hospital or clinic. Cover: the patient record and encounters, orders and results, medications, clinical documentation, scheduling, billing and coding, interoperability standards and interfaces, consent, access control and break-the-glass, audit, clinical decision support, patient portal, downtime procedures. Related: knowledge-base, booking-system.
