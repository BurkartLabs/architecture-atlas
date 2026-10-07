// Details for the forum platform plate, part 3: moderation, spam defenses, identity and permissions.
ATLAS.details("forum-platform", {
  "flag-system": {
    s: "Lets members report posts and accounts for a stated reason, collects the reports against the target and feeds them into the review queue, hiding content automatically past a threshold.",
    d: "A flag records the reporter, target, reason (spam, off-topic, inappropriate, other) and optional note. Each reason has a weight; when the weighted total from distinct members passes a threshold, the post is hidden pending review and the author is told. Flags from members with a good record count more. Staff resolve flags as agreed, disagreed or ignored, which updates each flagger's accuracy. It is hard because mass flagging can be used as a weapon, and hidden content must be appealable.",
    k: ["Auto-hide at a threshold versus wait for a moderator: auto-hide limits harm during slow response, but lets a group silence a post by flagging together.", "Weight flaggers by past accuracy versus count all equally: weighting resists brigades and entrenches whoever flagged early; equal weight is fair and easy to game."],
    p: ["A coordinated group flags a legitimate post, it is hidden, and the author gets no clear explanation or way to appeal.", "A flag on a private message reveals its text to the wrong audience."],
    v: "Flag a test post from three eligible accounts and confirm it is hidden and enters the queue with all three reasons. Resolve it as disagreed and confirm it reappears and flaggers' accuracy changes.",
    dep: ["posts", "trust-levels", "review-queue", "primary-store"]
  },
  "review-queue": {
    s: "A single place where moderators work through flagged posts, flagged users, new-user content awaiting approval and automatic detections, deciding each item once.",
    d: "Every reviewable item has a type, a target, a score that sums its reasons and a state. The queue sorts by priority, shows context such as nearby posts and the author's history, and offers actions: approve, delete, hide, silence the author or ignore. Resolutions are recorded with who decided. Items are claimed so two moderators do not act at once. It is hard because volume spikes, items lose relevance when other staff act elsewhere, and context must load fast.",
    k: ["One unified queue versus separate queues per source: unified avoids missed items and fatigue from many places, but mixes severities.", "Claim items versus first action wins: claiming prevents duplicate work, but needs expiry for abandoned claims."],
    p: ["An item left claimed by a moderator who logged off stays stuck while the problem content stays visible.", "The queue shows an item whose post was already deleted, and the moderator acts on a stale view."],
    v: "Generate a flag, a new-user post and an automatic detection. Confirm all three appear once in priority order, two moderators cannot resolve the same item, and each resolution records who decided and when.",
    dep: ["flag-system", "approval-queue", "moderator-actions", "mod-action-log", "spam-classifier"]
  },
  "approval-queue": {
    s: "Holds posts or topics from new or restricted members, or in controlled categories, out of public view until a moderator approves them.",
    d: "When a rule matches, such as a new account, a link in a first post, a watched word or a category requiring approval, the content is stored but marked pending and hidden from everyone but the author and staff. The author sees a message that it awaits review. Approval publishes it as of approval time or original time and triggers notifications and indexing. Rejection can delete the post and optionally penalize the author. It is hard because delay discourages honest newcomers, and publishing late posts may need renumbering.",
    k: ["Pre-moderate new members versus post and clean up afterward: pre-moderation keeps spam out of view, but slows genuine newcomers and loads moderators.", "Publish with original timestamp versus approval time: original time preserves context in a thread, but inserts a post out of order for readers."],
    p: ["Approvals arrive days later, so replies already written seem to answer nothing.", "Pending content leaks through search or notifications before approval."],
    v: "Post as a new account with a link and confirm the post is visible only to the author and staff. Approve it and confirm it appears in the topic, in search and in notifications exactly once.",
    dep: ["posts", "new-user-limits", "review-queue", "watched-words"]
  },
  "moderator-actions": {
    s: "The operations staff can apply to content and members: edit, hide, delete, lock, move, change owner, add a whisper, change a title or category and send a warning.",
    d: "Each action checks that the actor has the right role for the target, performs the change through the same code ordinary edits use, and writes a log record. Actions can notify the author with a canned or custom message. Some are reversible and some are not. Whispers let staff talk inside a topic without members seeing. It is hard because staff powers must be limited by role, every action needs an audit entry, and shortcuts that bypass normal validation tend to create inconsistent data.",
    k: ["Moderator edits go through the normal path versus a privileged path: the normal path keeps counters, revisions and events correct, but may refuse an action staff need.", "Silent actions versus always notify the author: silence avoids drama and feels arbitrary; notices cost time and explain."],
    p: ["A privileged shortcut skips revision history, so a staff edit can be changed with no trace.", "Mistaken bulk action cannot be undone because deleted content was removed outright."],
    v: "Perform each action as a moderator and confirm it changes the target through normal rules, writes a log entry with actor and reason, and a plain member attempting the same call receives a denial.",
    dep: ["posts", "topics", "permission-model", "mod-action-log", "soft-delete"]
  },
  "sanctions": {
    s: "Graduated penalties on accounts: a warning, a silence that blocks posting, a suspension that blocks login for a period, and a permanent ban.",
    d: "A sanction records the account, type, reason shown to the member, start and end, and the moderator. Silence blocks writing, but allows reading; suspension ends sessions and refuses login until it expires; a ban may also record addresses and email to block re-registration. Members see the reason when they try to act. Expiry is checked on use or by a job. It is hard because blocking an address also blocks innocent people, and evasion by new accounts is easy.",
    k: ["Silence versus suspend: silence keeps the member reading and able to see the explanation, but they can still lurk and share; suspension fully removes access.", "Block by address versus by account only: address blocks stop casual evasion, but hit shared networks and mobile carriers."],
    p: ["Banning by shared network address locks out an entire office or household.", "A suspension that does not end existing sessions lets the member keep posting until their token expires."],
    v: "Silence an account for a day and confirm it cannot post but can read and sees the stated reason. Suspend it, and confirm active sessions end immediately and login fails with the reason until expiry.",
    dep: ["accounts", "sessions", "mod-action-log", "scheduler", "notification-generator"]
  },
  "watched-words": {
    s: "Operator-defined word and pattern lists that automatically block, require approval for, flag, censor or link-replace matching text in posts and titles.",
    d: "Lists contain words or patterns with an action. On posting, the text is matched against the compiled list, and the action runs: reject with a message, queue for approval, flag, replace with symbols, or rewrite. Whole-word matching, case folding and handling of look-alike characters reduce evasion. Matching must be fast since it runs on every post. It is hard because pattern lists produce false positives, evasion by spelling tricks is constant, and unbounded patterns can slow matching to a crawl.",
    k: ["Block outright versus queue for review: blocking is immediate and annoys genuine users on a false match; queueing is gentler and adds moderator work.", "Plain word lists versus regular expressions: expressions catch variants, but invite slow patterns and surprising matches."],
    p: ["A word on the list also appears inside innocent words and blocks legitimate posts without explanation.", "A badly written pattern causes catastrophic backtracking and freezes every posting request."],
    v: "Add a block word and a queue word. Post a message containing each, plus the block word as part of a longer innocent word. Confirm the expected action fires for the first two and not for the third.",
    dep: ["approval-queue", "flag-system", "site-settings"]
  },
  "soft-delete": {
    s: "Marks posts, topics and accounts as deleted without removing their data at once, hiding them from members while keeping them recoverable for staff for a period.",
    d: "A deleted flag and timestamp hide the item everywhere ordinary queries run, but keep rows, revisions and relations. Staff see deleted items and can restore them within the retention window; a job then purges them permanently. Deleting the first post deletes the topic. Counters and search entries adjust. It is hard because every query must remember to exclude deleted rows, and permanent erasure, when required by law, must also reach backups and derived data.",
    k: ["Soft delete then purge versus delete immediately: soft delete allows recovery from mistakes and abuse investigation, but leaves data around and complicates every query.", "Short versus long retention: short limits liability and storage; long helps appeals and mistakes."],
    p: ["A single query that forgets the deleted filter shows removed content to members.", "Deleted content remains in search, caches or notifications long after deletion."],
    v: "Delete a post and confirm it vanishes from the topic, lists, search, notifications and feeds for members, stays visible to staff, and is restored intact. After the retention period confirm it is gone from the database.",
    dep: ["posts", "topics", "job-queue", "search-indexer", "cache-invalidation"]
  },
  "moderator-notes": {
    s: "Private notes attached to members or posts, visible only to staff, recording context, warnings given and decisions so moderators share history.",
    d: "A note stores the subject, author, text and time, and is shown on the member's admin page and in the review queue. Notes record verbal agreements, prior warnings and reasons for leniency. Some systems allow structured note types, such as a warning count. Notes are excluded from exports unless required. They are hard in a human way: they are discoverable through legal or data-access requests, they can be unfair if written casually, and they must never leak into member-facing pages.",
    k: ["Free-text notes versus structured records: free text is quick and expressive, but hard to query; structured records allow reports and are more rigid.", "Visible to all staff versus only senior: broad visibility shares context, but exposes sensitive remarks to more people."],
    p: ["A note field rendered on a page that members can see discloses what staff really think.", "Notes are overlooked because they are not shown in the queue where decisions are made."],
    v: "Add a note to a member and confirm it appears on the staff view and in the queue for that member's posts, and that an API call as the member and as a plain moderator without access returns nothing.",
    dep: ["accounts", "permission-model", "review-queue"]
  },
  "mod-action-log": {
    s: "An append-only record of every staff action, with who did it, to what, when, from where and the stated reason.",
    d: "Each moderator action, role change, setting change and sanction writes a row with actor, action type, target, details and address. The log is searchable by actor, target and type, and cannot be edited or deleted by moderators. It supports accountability, appeals and investigation of misuse. It is hard because logging must be unavoidable, so any code path that changes content as staff has to write to it, and because the log itself contains sensitive information.",
    k: ["Write in the same transaction versus asynchronously: the same transaction guarantees an action and its record exist together, but slows the action and can fail it.", "Keep forever versus rotate: keeping supports long investigations, but retains personal data past its purpose."],
    p: ["A scripted or API-driven action that bypasses the log leaves staff changes with no record.", "Log rows hold details such as removed post text that no longer follow the privacy rules of the original."],
    v: "Perform one action of every type through the interface and the API, and confirm each produces exactly one log row with the right actor, target and reason, and that no staff role can modify those rows.",
    dep: ["primary-store", "permission-model", "accounts"]
  },
  "spam-classifier": {
    s: "Scores new posts and registrations by content and context to decide whether to allow, queue or reject them, combining local rules with an optional external service.",
    d: "Inputs include the text, links, the author's age and trust level, posting rate, the address and what previous posts were flagged. A set of rules gives a score; a high score blocks, a middle score queues for review. Some sites also send content to an outside classifier, which costs latency and discloses text. Results feed back from moderators' decisions. It is hard because spammers adapt, false positives drive away real members, and the classifier sits on the posting path.",
    k: ["Local rules versus an external service: local rules are private and fast but static; an external service learns from many sites and receives your members' content.", "Block versus hold for review: blocking removes the work, but a false positive silently loses a real post; holding is safer and slower."],
    p: ["A classifier outage makes posting fail or lets everything through, depending on the default.", "Learning only from the reports of a few moderators encodes their bias and misses new patterns."],
    v: "Submit a known spam sample, a borderline sample and a normal post from a new account. Confirm they are blocked, queued and published, and that moderator decisions on the queued one change the next score.",
    dep: ["posts", "trust-levels", "reputation-lookups", "link-and-domain-rules", "review-queue"]
  },
  "rate-limiter": {
    s: "Caps how often an address, account or session may perform an action, such as posting, liking, logging in or sending mail, within a sliding time window.",
    d: "Each limited action has a key (account, address, route), a window and a maximum. Counters live in the fast key-value store with expiry, so checking costs one round trip. Limits scale with trust level. Exceeding a limit returns a clear error with a retry time. Some limits are cooperative (the composer waits) and some are hard. It is hard because limits must be strict enough to stop floods but not hit shared networks or legitimate bursts, and a failure of the store must have a defined behavior.",
    k: ["Fixed window versus sliding window: fixed windows are cheap and allow double bursts at the boundary; sliding windows are smoother and cost more state.", "Fail open versus fail closed when the counter store is down: failing open keeps the site usable and removes protection; failing closed is safe and blocks everyone."],
    p: ["Limiting by address blocks a whole school or company behind one shared address.", "A limit with no clear message makes members think the site is broken."],
    v: "Post faster than the new-member limit and confirm the over-limit request is refused with a retry time. Wait the window, confirm posting works, and confirm a higher trust level has a higher cap.",
    dep: ["counter-store", "trust-levels", "site-settings"]
  },
  "new-user-limits": {
    s: "Extra restrictions on new accounts, such as fewer links, no images, limited replies per day and no private messages to strangers, relaxed as they gain trust.",
    d: "The limits are tied to trust level and account age: a newcomer may post a few replies, limited links and mentions, cannot start many topics, and cannot upload until they have read enough. Each restriction is configurable. The member sees why something is blocked and how to lift it, usually by reading and participating. It is hard because limits protect against spammers but are the first thing a genuine newcomer meets, so unclear or severe rules cause people to leave.",
    k: ["Tight restrictions versus open start: tight limits frustrate real newcomers but starve spammers; open starts welcome people and need heavier cleanup.", "Time-based versus behavior-based relaxation: time is predictable and farmable by waiting; behavior ties trust to real participation."],
    p: ["Limits that give no explanation make new members believe the site is broken and abandon it.", "Spammers wait out the time threshold and then post links freely."],
    v: "Register a new account and confirm posting a link, an image and a second topic are each refused with a clear reason. Advance the account through the trust requirements and confirm each restriction lifts.",
    dep: ["trust-levels", "rate-limiter", "uploads-and-images", "site-settings"]
  },
  "link-and-domain-rules": {
    s: "Operator-controlled lists and limits for links in content: blocked domains, allowed domains, links per post, attribute handling and rewrite of outbound links.",
    d: "On posting, links are extracted and checked against block and allow lists, with different rules by trust level. Blocked domains refuse or queue the post. Outbound links get attributes that discourage search-ranking abuse and may route through a warning page. Short-link services can be expanded and checked. It is hard because link spam is the main motive for abuse, lists age quickly, and the same domain may be fine in a discussion and harmful in a promotional post.",
    k: ["Block lists versus allow lists for new members: block lists are light and miss new domains; allow lists are safe and restrict ordinary sharing.", "Expand short links server-side versus leave them: expansion exposes hidden destinations, and contacts remote hosts with the fetch risks that implies."],
    p: ["Links in image markup or signatures bypass checks that only look at the post text.", "Blocking a domain used legitimately in a community prevents members from citing sources."],
    v: "Post a link to a blocked domain, a short link that resolves to it, and an allowed link. Confirm the first two are refused or queued, the third publishes, and every outbound link carries the configured attributes.",
    dep: ["posts", "markup-parser", "site-settings", "trust-levels"]
  },
  "reputation-lookups": {
    s: "Checks of an address or email against lists of known abusive sources, and local history of earlier abuse from the same network, used as input to spam scoring.",
    d: "At registration or posting, the address is looked up against public block lists using DNS queries, and the email domain against lists of disposable providers. Local data records prior sanctions and flags per address. Results add to a risk score rather than deciding alone. Lookups are cached and have short timeouts. It is hard because third-party lists have false positives, shared networks give a poor signal, and the lookup adds latency and a dependency to sign-up.",
    k: ["Block on a list hit versus add to a score: blocking is simple but too coarse; scoring combines weak signals, and needs tuning.", "Query live versus cache and refresh: live is accurate and slow and leaks addresses to list operators; caching is fast and stale."],
    p: ["A slow list server stalls every registration while the lookup waits to time out.", "Anyone on a mobile carrier address is treated as abusive because one user earlier was."],
    v: "Register from a test address that is on a block list and one that is not. Confirm the listed one receives a higher risk score and extra steps, and the lookup stays within its timeout when the list server is slow.",
    dep: ["spam-classifier", "counter-store", "registration-screening"]
  },
  "challenge-service": {
    s: "Presents a test that is easy for people and hard for automated clients, such as a puzzle or invisible behavior check, at sign-up, login or posting.",
    d: "The server asks for a challenge only when risk is high, a token is returned to the page, and the server verifies the token against the challenge provider or its own answer store before proceeding. Honeypot fields and timing checks work without any visible test. Alternatives are needed for people who cannot solve visual puzzles. It is hard because challenges cost every member friction, bots increasingly solve them, and accessibility and privacy concerns apply.",
    k: ["Always challenge versus only when risk is high: always is simple and annoying; risk-based keeps legitimate users clear and needs a reliable score.", "Third-party challenge versus self-hosted: third-party solves better and receives member traffic data; self-hosted keeps privacy and solves worse."],
    p: ["The challenge has no accessible alternative, so some members cannot register at all.", "Verification is skipped on one endpoint, and bots simply call the unprotected route."],
    v: "Submit a registration without a valid token and with a replayed one, and confirm both are rejected. Complete a challenge normally and confirm the account is created, and low-risk logins are not challenged.",
    dep: ["registration-screening", "spam-classifier", "sessions"]
  },
  "registration-screening": {
    s: "Checks applied to new sign-ups: email verification, domain rules, answers to site questions, manual approval and invitation-only modes.",
    d: "Sign-up collects a username, email and password, then sends a verification link that proves the address. Optional steps include a required answer to a question, approval of each account by staff, restricting to allowed email domains, or invitation links. Accounts are inactive until completed. Unverified accounts are removed after a period. It is hard because each barrier loses real users, usernames and email addresses invite impersonation and enumeration, and verification mail is itself a deliverability problem.",
    k: ["Open registration versus approval or invitation: open grows fast and attracts abuse; approval gives control and slows growth and adds work.", "Reveal that an email is taken versus a generic message: revealing helps honest users and allows account enumeration; a generic message protects privacy."],
    p: ["Sign-up error messages confirm which emails already have accounts, letting attackers list members.", "Verification emails land in spam, so real people never finish registering."],
    v: "Register with a new email and confirm the account is inactive until the link is used. Try an existing email and confirm the response is identical to a new one, and that stale unverified accounts are removed.",
    dep: ["accounts", "outbound-email", "reputation-lookups", "challenge-service"]
  },
  "bulk-cleanup": {
    s: "Staff tools that find and remove everything a spammer or abuser posted across the site: all posts by an account, matching text, or one address.",
    d: "Given a member, the tool lists their posts, topics, messages and uploads and deletes them in one action, optionally suspends the account and blocks its address and email. Searches by text or link find the rest. Operations run as background jobs with progress and are logged. Deleted content goes through the normal soft-delete path so counters and indexes update. It is hard because mass operations are dangerous, so they need a preview, limits and an undo, and may touch thousands of rows at once.",
    k: ["Delete everything in one step versus review each item: one step is fast against a flood, but one wrong target removes a good member's history.", "Hard delete spam versus soft delete: hard delete frees space and removes harmful content, but cannot be undone or reviewed later."],
    p: ["A mistaken bulk delete of a long-time member's posts cannot be restored because it bypassed soft delete.", "A huge cleanup job locks tables and slows the live site."],
    v: "Create a spam account with fifty posts and uploads, run cleanup and confirm all are removed from lists and search, the account is suspended, counters are corrected, and the whole action appears in the log and can be restored.",
    dep: ["soft-delete", "sanctions", "job-queue", "mod-action-log", "search-indexer"]
  },
  "accounts": {
    s: "The record of each member: identifier, username, email addresses, password credential, status, preferences, timestamps and links to everything they created.",
    d: "An account stores a stable internal id, a unique case-insensitive username, one or more emails with verification state, a salted password hash, status flags (active, staged, suspended), preferences and trust level. Staged accounts exist for people created by import or email who have not yet signed in. Usernames can change, so content refers to the id. It is hard because identity data is the most sensitive in the system, usernames collide in confusing ways, and many other tables reference accounts.",
    k: ["Immutable id with a changeable username versus username as key: an id keeps references stable through renames, but needs lookup by name everywhere in the interface.", "Unique case-folded usernames versus allowing look-alikes: strict uniqueness prevents impersonation, but must handle character-set tricks."],
    p: ["Two accounts whose usernames differ only by look-alike characters enable convincing impersonation.", "Storing weakly hashed passwords turns a database leak into a credential leak for other sites."],
    v: "Create accounts named with different case and with look-alike characters and confirm collisions are rejected. Rename an account and confirm all its posts, mentions and links still resolve to it.",
    dep: ["primary-store", "sessions", "groups"]
  },
  "sessions": {
    s: "The mechanism that keeps a member logged in across requests: a token held by the browser, validated against server-side state, with expiry and revocation.",
    d: "After login, the server issues an opaque token stored in a secure cookie, or a signed token, tied to the account, device and creation time. Each request validates it and finds the account. The member can view and end sessions on other devices, and sanctions or password changes revoke them. Tokens rotate periodically. It is hard because logout must truly invalidate access, cookie settings must defend against theft and cross-site requests, and a lookup occurs on every request.",
    k: ["Server-side opaque sessions versus self-contained signed tokens: server-side tokens can be revoked at once; signed tokens avoid a lookup and stay valid until they expire.", "Long-lived remember-me versus short sessions: long sessions are convenient and increase the damage from a stolen device."],
    p: ["A password change that does not revoke other sessions leaves a stolen session working.", "A cookie without the right flags is readable by scripts or sent over insecure connections."],
    v: "Log in on two browsers, change the password on one, and confirm the other is logged out on its next request. Inspect the cookie and confirm it is secure, not readable by scripts and scoped to the site.",
    dep: ["accounts", "counter-store", "primary-store"]
  },
  "sso-consumer": {
    s: "Lets the forum trust an external identity system for login: members authenticate elsewhere and arrive with a signed assertion of who they are.",
    d: "The forum redirects to the external system with a signed request, and receives a signed payload with the member's identifier, email, name and groups. It verifies the signature and nonce, then finds or creates the account by the external id and updates fields. Local passwords are disabled. Logout and deprovisioning must be coordinated. It is hard because trusting an assertion means trusting its signing key, matching by email can merge the wrong people, and changes in the external system must propagate.",
    k: ["Match accounts by external id versus by email: ids are stable and require care on first link; email matching is convenient and merges accounts when addresses change or are reused.", "Sync groups on each login versus only at creation: syncing keeps access aligned, but overwrites local group changes."],
    p: ["A replayed or unsigned assertion logs someone in as another member when the nonce and signature are not checked.", "A removed employee keeps access because the forum session outlives their external account."],
    v: "Log in through the external system and confirm one account is created with the right groups. Replay the same assertion and tamper with its signature, and confirm both are refused.",
    dep: ["accounts", "sessions", "groups"]
  },
  "sso-provider": {
    s: "Lets the forum act as the identity source for other applications, issuing signed assertions or tokens when a member is logged in here.",
    d: "Another application sends a member to the forum with a request. If the member is logged in, the forum returns a signed or token-based assertion carrying selected profile data and group membership, after consent where required. Client applications are registered with secrets and allowed return addresses. Scope limits what each receives. It is hard because redirect addresses must be validated exactly, secrets must be rotated, and it makes the forum a critical dependency of other systems.",
    k: ["Issue only identity versus include group and profile claims: minimal claims limit leakage, but clients then need extra API calls.", "Pre-approve clients versus ask the member: pre-approval is smooth for trusted apps, while consent protects members from third parties."],
    p: ["Loose matching of return addresses lets an attacker steal assertions through a lookalike address.", "A forum outage becomes an outage of every application relying on it for login."],
    v: "Register a client with one return address. Complete a login and confirm the assertion carries only allowed claims. Request one with a different return address and confirm it is refused.",
    dep: ["accounts", "sessions", "api-keys"]
  },
  "social-login": {
    s: "Login through accounts at large identity providers using an open authorization protocol, linking each external account to a local member.",
    d: "The member is redirected to the provider, approves limited access, and the forum receives a code that it exchanges for tokens and a profile. It links the provider's stable id to a local account, creating one or asking the member to confirm an email. Providers can be enabled individually. It is hard because email addresses from providers differ in how trustworthy they are, linking can take over an existing account, and provider changes break the integration.",
    k: ["Auto-link on matching email versus require confirmation: auto-linking is easy and enables takeover if a provider does not verify addresses; confirmation adds a step.", "Offer many providers versus few: many providers reduce friction, and each adds maintenance and a place accounts can be lost."],
    p: ["Linking by an unverified provider email lets an attacker take over a member's account.", "A provider shutting down an app leaves members unable to log in with no recovery path."],
    v: "Log in through a test provider with a new identity and confirm an account is created and linked. Log in with one whose email matches an existing account without verification and confirm linking requires confirmation.",
    dep: ["accounts", "sessions", "registration-screening"]
  },
  "two-factor": {
    s: "Adds a second proof at login, using a code from an authenticator app, a hardware key or a passkey, with backup codes and recovery rules.",
    d: "After the password, the member supplies a time-based code or approves with a key; passkeys can replace passwords entirely. Enrollment shows a secret once and generates backup codes. Staff may be required to use it. Failed attempts are limited. Recovery for lost devices is the weakest point. It is hard because each recovery path is a way around the second factor, and because support staff will be asked to disable it for people who claim to be the owner.",
    k: ["Require for staff only versus everyone: staff-only protects the highest-risk accounts cheaply, while everyone-required costs support load.", "Strong recovery versus easy recovery: strict recovery keeps attackers out and locks out real members; easy recovery restores access and weakens the factor."],
    p: ["A support-driven reset that checks nothing lets an attacker remove the second factor with a convincing email.", "Unlimited code attempts allow guessing the six digits."],
    v: "Enable two-factor, log in with a wrong code several times and confirm lockout, then with a correct code and with a backup code once. Confirm the backup code cannot be used twice.",
    dep: ["accounts", "sessions", "rate-limiter"]
  },
  "permission-model": {
    s: "The set of rules that decides whether an actor may see, create, edit or delete a given thing, built from account, trust level, groups and category settings.",
    d: "Checks are expressed as questions such as can this user see this topic. They combine global capabilities, group membership, trust level, category security (see, reply, create) and per-object state (hidden, deleted, private message participant). Reads need an efficient form: lists filter by a precomputed set of allowed category ids. Writes check individual rules. It is hard because the logic is spread through the system, any query that forgets it leaks data, and caching results risks serving them to the wrong person.",
    k: ["Central policy functions versus checks scattered at call sites: central functions are auditable and awkward for list queries; scattered checks are quick to write and missed.", "Precompute allowed category sets per user versus check per row: precomputed sets make lists fast, but must be invalidated whenever groups or settings change."],
    p: ["A new endpoint or plugin returns content without calling the permission check, which exposes private categories.", "A cached allowed-categories set outlives a group removal, so the member keeps seeing content."],
    v: "For a matrix of roles (anonymous, new member, group member, moderator, admin) against public, restricted and private objects, run every read and write route and confirm each result matches the intended table.",
    dep: ["groups", "categories", "trust-levels", "accounts"]
  },
  "groups": {
    s: "Named sets of members used to grant access, assign roles, send messages and automate trust, with rules for who can join, leave and see the membership.",
    d: "A group has members and owners, a visibility, join rules (open, request, invitation-only), optional automatic membership by email domain or trust level, and defaults such as notification levels. Category permissions and many settings reference groups. Membership changes trigger updates to cached permission sets and to badges or flair. It is hard because a group is simultaneously a security boundary, a social unit and a messaging address, and changes must propagate quickly to caches.",
    k: ["Automatic membership rules versus manual: automatic rules scale and follow domains or levels, but can grant access by an attacker-controlled attribute.", "Visible membership versus hidden: visible groups build community, and hidden groups protect sensitive ones such as moderators."],
    p: ["Domain-based automatic membership grants access to anyone who can register an unverified address at that domain.", "Removing someone from a group does not take effect until a cache expires."],
    v: "Add a member to a group that has access to a private category and confirm access immediately. Remove them and confirm access ends on the next request, including in search and live updates.",
    dep: ["accounts", "primary-store", "cache-invalidation"]
  },
  "api-keys": {
    s: "Credentials for programs rather than people, with scopes limiting what they can do and whom they can act as, and records of use.",
    d: "An administrator creates a key, optionally scoped to routes, to read-only operations or to acting as a single account or any. Requests present the key in a header; the server finds its hash and checks scope and the acting user. Keys can be revoked and their last use shown. Per-key rate limits apply. It is hard because a key is a password with no second factor, leaks into logs and repositories, and broad keys with act-as ability can do anything.",
    k: ["Global keys versus scoped keys: global keys are easy to start with and powerful if leaked; scoped keys limit damage and take planning.", "Store the key hash versus the key: a hash means a database leak does not reveal keys, but the key can be shown only once."],
    p: ["An all-powerful key is embedded in an integration script and then committed to a public repository.", "A key never expires and nobody remembers which system uses it."],
    v: "Create a read-only scoped key and confirm it can fetch topics but is refused when posting. Revoke it and confirm the next request fails, and that the key's last-used time was recorded.",
    dep: ["accounts", "rate-limiter", "permission-model"]
  },
  "account-deletion": {
    s: "Handles a member's request to leave: removing or anonymizing their personal data and content, while keeping conversations intact where the law and community needs allow.",
    d: "A deletion removes credentials, emails, profile fields, uploads and private data, and either deletes posts or reassigns them to an anonymous placeholder account. Content others quoted or answered may be kept anonymized. Backups, logs and search entries need handling. A waiting period allows reversal. The process runs as jobs and records proof it completed. It is hard because personal data hides in many places: logs, revisions, notifications, caches and the text of other people's posts.",
    k: ["Delete posts versus anonymize them: deletion honors the request completely and breaks threads others rely on; anonymization keeps conversations and retains the text.", "Immediate versus waiting period: immediate respects the request quickly, and a waiting period prevents accidental or hijacked deletion."],
    p: ["Deleting the account but leaving the email in logs, revisions and exports means the personal data persists.", "A hijacked account is deleted by an attacker, taking the member's history with it."],
    v: "Delete a test account with posts, uploads and messages. Confirm no profile, email or upload remains, posts show an anonymous author, and a search through the database and logs for the old email returns nothing.",
    dep: ["accounts", "posts", "soft-delete", "job-queue", "audit-logging", "export-jobs"]
  },
});
