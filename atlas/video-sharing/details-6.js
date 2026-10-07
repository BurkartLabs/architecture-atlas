// Details for the video sharing plate, part 6: cross-cutting concerns.
ATLAS.details("video-sharing", {
  "cost-per-watch-hour": {
    s: "The all-in cost of delivering one hour of video to a viewer, covering encoding, storage, delivery and operations, which constrains nearly every technical choice.",
    d: "Most of the bill is delivery bandwidth and storage, with encoding a large one-time cost per upload. Because the catalog is a long tail, a small share of videos produces most watch hours, so spending more per popular video, such as better codecs, repays itself while spending the same on every video does not. The unit cost must stay below revenue per hour, including for free content with no ads. It is hard because savings in one place, such as compression, add cost in another, such as encode time and device compatibility.",
    k: ["Spend on efficiency for popular videos only versus uniformly: targeting popular videos concentrates savings where views are; it needs popularity tracking and reprocessing pipelines.", "Lower quality ceiling versus higher delivery cost: capping top resolution saves bandwidth; it reduces perceived quality and creator satisfaction."],
    p: ["Optimizing average cost hides a few very expensive categories, such as huge archives nobody watches.", "A new feature adds renditions for every video and quietly doubles storage cost."],
    v: "Compute cost per watch hour from the bill and watch totals, broken down by encode, storage and delivery, monthly. The breakdown reconciles to finance records and each change in a component shows its effect on the total.",
    dep: ["storage-tiers", "encoding-ladder", "edge-caches"]
  },
  "startup-and-latency-targets": {
    s: "The agreed limits on how quickly playback starts, how seldom it stalls and how fast every interactive request answers, which set the budget for every component in the path.",
    d: "Viewers abandon when video takes more than a couple of seconds to start, so targets are set at high percentiles for startup, rebuffering and seek time, and for search, suggestions and comments. Each component in the path gets a share of the budget: page load, manifest, license, first segment. Targets differ for live. Hard because the budget is spent by many teams, the tail is driven by rare slow paths, and tightening one target, such as lower latency for live, can worsen another, such as smoothness.",
    k: ["One global target versus targets per region and device: global is simple to communicate; per-segment targets reflect real network conditions and prevent hiding poor regions.", "Optimize median versus tail: median improvements are visible in dashboards; tail improvements matter more to viewers who abandon."],
    p: ["Teams each meet their own latency target while the sum exceeds what viewers tolerate.", "Targets are measured in lab conditions and never reflect real devices and networks."],
    v: "Track the percentile of time to first frame, rebuffer ratio and failed start rate from real sessions by segment. Each stays within its target, and a budget breakdown shows time spent in every step.",
    dep: ["qoe-metrics", "abr-controller", "edge-caches"]
  },
  "regions-and-data-residency": {
    s: "Where data and processing may live and which laws apply in each country, affecting storage placement, comment and history data, content restrictions and payment handling.",
    d: "Video bytes can be cached globally, but personal data, such as viewing history, comments and payment details, is often required to stay in particular jurisdictions or be handled under specific rules. Content legality and rights also vary by country. Teams decide which services are regional, which are global and how users' home regions are determined and changed. Hard because global features such as recommendation and search want data from everywhere, while rules differ and change over time.",
    k: ["Global services with regional data stores versus fully regional stacks: global services are simpler and share learning; fully regional stacks satisfy strict rules but duplicate cost and fragment the product.", "Place data by user's home region versus viewer's location: home region is stable and predictable; location-based placement matches where the law applies but moves data as people travel."],
    p: ["A global analytics job copies regional personal data into a store outside the permitted region.", "A viewer who moves countries sees stale or wrongly restricted content and history."],
    v: "Trace where each category of personal data is stored and processed for test users in several regions. All copies are in permitted locations, and a region move migrates or restricts data as policy states.",
    dep: ["catalog-database", "age-and-region-gating", "event-warehouse"]
  },
  "adversarial-users": {
    s: "The assumption that some uploaders, viewers, advertisers and even rights claimants act in bad faith, so every feature needs an abuse case and a cost to the attacker.",
    d: "Spammers flood comments and search with links, botnets inflate views and engagement, uploaders disguise copies and harmful content, claimants make false claims, and fraudsters abuse payouts and account recovery. Defenses are layered: rate limits, account reputation, classifiers, human review and economic friction. They must adapt as attackers learn. Hard because every defense creates false positives that harm honest users, and attackers can measure what gets through.",
    k: ["Friction for everyone versus risk-based friction: universal friction is simple and fair; risk-based friction spares honest users but needs accurate scoring and can be probed.", "Public explanations of enforcement versus opacity: explanations build trust and help honest creators; they teach attackers what to avoid."],
    p: ["A defense deployed in one feature is bypassed through another surface with no checks.", "Attackers learn a threshold from error messages and stay just below it."],
    v: "Run red-team exercises for each major abuse type: comment spam, view inflation, evasive copies and false claims. Each is detected or made uneconomic within the target time, and false positive rates on honest accounts are measured.",
    dep: ["policy-classifiers", "view-counting", "upload-quotas", "content-fingerprinting"]
  },
  "device-and-codec-compatibility": {
    s: "The long tail of devices that must play the output, from old televisions to new phones, which limits codec, container, encryption and player feature choices.",
    d: "Support is determined by decoder hardware, software versions, protection modules and browser media features, and old devices stay in use for many years. The platform keeps a device capability database, tests on a lab of real hardware, and chooses which renditions to offer to which devices. Adding a new codec means adding renditions, tests and fallbacks. Hard because capabilities are misreported, vendors patch unevenly, and dropping support affects real people who cannot upgrade.",
    k: ["Lowest common denominator output versus per-device renditions: a single compatible output is simple and cache-friendly; per-device renditions save bandwidth but fragment caches and testing.", "Maintain support for old devices versus end of life: continued support keeps every viewer; it constrains the whole system to old formats and consumes engineering effort."],
    p: ["A device reports support for a codec profile it decodes badly, and viewers see corrupted video.", "A removed old format strands a group of television owners with no notice."],
    v: "Run an automated playback suite on the device lab for every supported device model with each rendition and protection system. All required combinations play without errors, and unsupported ones fall back to a working rendition.",
    dep: ["codec-encoders", "decode-and-render", "content-decryption", "manifest-parser"]
  },
  "durability-versus-deletion": {
    s: "The tension between promising never to lose a creator's video and promising to remove content quickly and completely when asked, which affects replication, backups and caches.",
    d: "Storage is built to survive any failure and keep many copies. Deletion must reach all copies, including caches, backups, derived data and partner systems, within legal and policy deadlines. The platform chooses retention periods for deleted data, whether backups are rewritten or expire, and how holds override deletion. Hard because every extra copy built for safety is another copy to delete, and mistakes in either direction have serious consequences: lost memories or content that stays online after a legal order.",
    k: ["Grace period before permanent deletion versus immediate: a grace period lets creators recover mistakes and attackers' deletions; immediate removal satisfies urgent legal and safety needs.", "Short-lived backups versus long retention: short retention shortens the deletion tail; long retention protects against disasters and operator error."],
    p: ["Backups retain deleted content well past the stated promise and are restored back into production.", "A legal hold stops the lifecycle delete for the wrong set of objects."],
    v: "Delete test content under normal, legal and urgent takedown paths. Public access stops within the stated time, all copies including backups are gone or cryptographically erased by the deadline, and an audit record proves each step.",
    dep: ["deletion-propagation", "replication-and-erasure-coding", "lifecycle-policies", "source-archive"]
  },
});
