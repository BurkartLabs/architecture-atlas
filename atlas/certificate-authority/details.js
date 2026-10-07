// Details for the certificate authority plate, part 1: enrollment, relying-party trust, subject validation.
ATLAS.details("certificate-authority", {
  "acme-server": {
    s: "The server side of an automated issuance protocol: it lets a client create an account, request certificates for names, prove control, and fetch the result without a person involved.",
    d: "Clients speak a JSON-over-HTTPS protocol with signed requests and single-use nonces. The server exposes a directory of endpoints for accounts, orders, authorizations, challenges, finalization and certificate download. State moves through defined statuses: pending, ready, valid, invalid. It hands validation to the validation components and issuance to the pipeline, so it holds little logic of its own. Hard parts are replay protection, idempotent retries when clients time out, and surviving enormous request volumes from fleets of clients on identical schedules.",
    k: ["Stateless signed requests with nonces vs session cookies: any front end can verify a request; the server must still store and expire nonces.", "Asynchronous orders vs one synchronous call: validation can take time and retry, but clients must poll and handle partial progress."],
    p: ["Clients all renewing at midnight produce a thundering herd that exhausts validation or signing capacity.", "A retry after a timeout creates duplicate orders when order creation is not idempotent."],
    v: "Run a client against a staging instance, request a certificate for a test name, and confirm it ends with a valid chain. Replay the same signed request and confirm the server rejects the reused nonce.",
    dep: ["orders-and-authorizations", "account-keys", "rate-limits"]
  },
  "orders-and-authorizations": {
    s: "The records that track a request: an order lists the names wanted, and each name gets an authorization that must be proven before issuance.",
    d: "An order is created with a set of identifiers and moves to ready only when every authorization is valid. Each authorization offers one or more challenges and expires after a set time. Validated authorizations can sometimes be reused for later orders. The store must handle concurrent updates, because a client, the validation workers and an expiry job all touch the same rows. The difficulty is state-machine correctness: a name must never reach issuance with a stale or invalidated authorization.",
    k: ["Per-name authorizations vs per-order validation: per-name lets one proof serve many orders; a revoked proof must then be found and invalidated everywhere it is reused.", "Short authorization lifetimes vs long: short limits stale proof; long saves validation load but weakens the evidence."],
    p: ["An authorization expiring between finalization and signing leads to a certificate issued on lapsed proof.", "Race between two workers marking the same challenge valid and invalid leaves the order in an inconsistent state."],
    v: "Create an order for two names, validate only one, and confirm finalization is refused. Validate both and confirm the order becomes ready and then valid.",
    dep: ["domain-control", "validation-reuse"]
  },
  "account-keys": {
    s: "The key pair each subscriber account uses to sign requests, plus optional binding to an existing customer account, so the authority can attribute and limit requests.",
    d: "Each account is identified by a public key; every request is signed with the matching private key. Some deployments add external account binding: a pre-shared identifier and MAC key proves the new account belongs to a known customer, which lets the authority apply contracts, quotas or organization-validated names. Key rollover lets an account change keys without losing its authorizations. The hard part is lifecycle: lost keys, shared keys across unrelated clients, and deciding what happens to issued certificates when an account is closed.",
    k: ["Key-only accounts vs bound accounts: key-only is frictionless and anonymous; bound accounts enable limits and accountability but need customer provisioning.", "One account per client vs shared account: shared simplifies management but widens the damage if its key leaks."],
    p: ["An account key copied into many images means one compromise lets an attacker request certificates as all of them.", "Account deactivation that does not cancel pending orders lets in-flight issuance continue."],
    v: "Create an account bound to a customer, request an organization name that only that customer may have, and confirm an unbound account asking for the same name is refused.",
    dep: ["rate-limits"]
  },
  "csr-intake": {
    s: "Accepts a certificate signing request, checks its signature, extracts the public key and requested names, and rejects or normalizes anything the profile does not allow.",
    d: "The request carries a public key, a proof of possession signature, and requested names and extensions. Intake verifies the signature, parses the structure strictly, and discards everything the authority does not copy: requested extensions are treated as suggestions, not commands. The names are normalized, for example case and internationalized forms, before matching to validated names. Parsers for these binary formats are an attack surface: malformed encodings, huge fields and unusual key parameters have caused crashes and misissuance.",
    k: ["Strict parsing that rejects ambiguity vs lenient parsing that repairs: strict catches malformed requests early; lenient accepts more legacy clients but risks differing interpretations.", "Take names only from validated state vs from the request: the first prevents a request from adding names; the second is simpler but dangerous."],
    p: ["Copying an extension from the request into the certificate lets a requester set usage flags they should not have.", "Weak or malformed keys accepted at intake surface later as certificates that clients refuse."],
    v: "Submit requests with a bad signature, a duplicated name, an oversized field and a forbidden extension; confirm each is rejected or stripped, and a clean request yields only profile-defined fields.",
    dep: ["certificate-profiles", "key-requirements", "name-policy"]
  },
  "enrollment-portal": {
    s: "The human and programmatic front door for customers: ordering, management, validation status, downloads and revocation, either as a website or an authenticated API.",
    d: "Customers log in, add organizations and domains, see which validations are current, request certificates, and download or revoke them. A parallel API serves automation. Role-based access limits who can order for which names. It writes to the same order and validation records as automated issuance. The difficulty is authorization: a portal bug that lets one customer act for another's names is effectively a validation bypass, so it is treated as part of the validation boundary.",
    k: ["Portal as a thin client of the issuance API vs separate logic: one path means one set of checks; a thick portal is faster to build but duplicates policy.", "Self-service revocation vs approved revocation: self-service is fast during incidents but needs strong proof of control."],
    p: ["Account takeover of a customer login grants certificates for every validated name that account holds.", "Cached validation status shown in the portal differs from the real record, so users order names that then fail."],
    v: "Log in as a user with access to one organization, attempt an order for another organization's domain by editing the request, and confirm the server refuses it.",
    dep: ["orders-and-authorizations", "account-keys", "org-validation"]
  },
  "client-automation": {
    s: "The software on subscriber machines that requests, validates, installs and renews certificates, reloading services without human steps.",
    d: "Agents run on web servers, load balancers or orchestration platforms. They generate keys locally, create orders, answer challenges by placing a file or a DNS record, retrieve the chain, write it where the service expects it, and trigger a reload. Renewal runs on a schedule, normally at about two thirds of the lifetime, with jitter. The authority cannot control these clients, so they must work against many versions and failure modes: unreachable servers, rate limits and misconfigured challenges.",
    k: ["Renew early with jitter vs renew late: early renewal leaves time to retry and spreads load; late renewal wastes less issuance but fails hard if anything is down.", "Keys generated on the host vs centrally: local keys never travel; central generation simplifies fleets but moves private keys over networks."],
    p: ["A renewal job that silently fails for weeks is found only when the certificate expires in production.", "Reload scripts that restart services break connections for every renewal."],
    v: "Shorten the test certificate lifetime, let the agent run for several renewal cycles, and confirm each cycle installs a new certificate and the service serves the new serial without dropped connections.",
    dep: ["acme-server", "challenge-methods"]
  },
  "rate-limits": {
    s: "Limits on requests, orders, failures and certificates per account, name or address, protecting validation and signing capacity and limiting abuse.",
    d: "Counters keyed by account, registered domain, client address and identifier set are checked at request time against configured windows. Separate limits cover failed validations, duplicate certificates for the same name set, and new accounts. Overrides exist for large customers. State is kept in a fast shared store. The hard part is fairness and recovery: a limit too tight blocks legitimate renewals during an incident, and one too loose lets a single customer or attacker drain validation capacity.",
    k: ["Limits by registered domain vs by account: domain limits stop sprawl across accounts; account limits are simpler but easy to evade with many accounts.", "Hard rejection vs queueing: rejection protects the system immediately; queueing is friendlier but lets backlog grow without bound."],
    p: ["Counting renewals against the same limit as new orders stops legitimate renewal exactly when mass revocation forces everyone to renew.", "Limit state lost on cache restart briefly lets abusive clients through."],
    v: "Issue certificates until the per-name limit is reached, confirm the next request is refused with a retry time, and confirm an exempt renewal for the same name still succeeds.",
    dep: []
  },
  "path-building": {
    s: "The client-side process of finding and checking a chain from a presented certificate to a trusted root, verifying signatures, names, validity dates and constraints at each step.",
    d: "A client collects candidate issuers by matching names and key identifiers, fetches missing intermediates if allowed, and tries paths until one satisfies every rule: signatures verify, dates are valid, basic constraints permit signing, name constraints are respected and key usage is correct. Multiple valid paths exist when cross-signing is used. Hard because implementations differ: one client may accept a chain another rejects, and the authority must publish chains that work for the whole range of clients.",
    k: ["Servers sending a full chain vs relying on client fetching: sending it is robust; fetching saves bytes but fails offline or behind restrictive networks.", "Strict path rules vs permissive: strict improves security; permissive supports old deployments and shapes what the authority can safely issue."],
    p: ["A missing intermediate works in clients that cache it and fails in clients that do not, producing intermittent outages.", "An expired cross-signed path breaks older clients even though newer paths are valid."],
    v: "Test a chain against several independent validation implementations and confirm all build the same valid path, then remove the intermediate and record which clients fail.",
    dep: ["trust-stores", "path-constraints", "cross-signing"]
  },
  "trust-stores": {
    s: "The curated lists of root certificates that a platform or application trusts, governed by published requirements and a review process that the authority must pass and keep passing.",
    d: "Platform vendors, browsers and enterprises each maintain a store. Inclusion requires an application, a period of public discussion, audits and technical review; continued inclusion depends on conduct. Stores may attach constraints to a root, such as limiting it to certain purposes or distrusting certificates issued after a date. Each program has its own rules and timelines. The challenge is that an authority answers to many stores whose requirements overlap but are not identical, and removal ends the business.",
    k: ["Single shared store vs per-platform stores: a shared one gives uniform behavior; separate stores allow independent judgments but force authorities to meet several rulebooks.", "Distrust of a root vs distrust by date: removal is blunt; date-based distrust spares existing certificates but needs client support."],
    p: ["A root joining one store late leaves a gap during which some clients reject all its certificates.", "Treating program requirements as a checklist rather than ongoing duties leads to removal after repeated incidents."],
    v: "Check that each root appears in every target store with the expected constraints, and that a certificate chaining to it validates in a clean client for each store.",
    dep: ["root-distribution"]
  },
  "root-distribution": {
    s: "How new and changed root certificates reach devices: operating system updates, application updates, and out-of-band trust store updates, with long tails of devices that never update.",
    d: "Roots ship inside software and are updated when the software is. Newer devices receive roots by periodic updates or a dynamic channel; older or embedded devices may keep the roots they shipped with for a decade. A new root therefore needs years of lead time, which is why authorities start with cross-signed roots. Distribution must also remove roots quickly during a distrust event, which depends entirely on the vendor's update path.",
    k: ["Slow-moving static root lists vs dynamically updated trust: static is simple and auditable; dynamic reacts to incidents but adds a new trusted update channel.", "Long-lived roots vs frequent new roots: long-lived roots reduce distribution work; short-lived ones limit key exposure but need constant coordination."],
    p: ["A new root issued years too late leaves a population of devices unable to trust any new certificate.", "An embedded device that cannot update turns a distrust event into a permanent outage."],
    v: "Measure the share of a sampled client population that includes the new root, by platform and version, and confirm it meets the plan before issuing from it directly.",
    dep: ["trust-stores", "cross-signing"]
  },
  "revocation-checking": {
    s: "How clients learn that a certificate has been revoked: fetching lists, querying a status service, or relying on short lifetimes and pushed lists, with a policy for what to do if the answer is unavailable.",
    d: "A client can download revocation lists, query an online status service per certificate, accept a stapled response, or consult a locally pushed compressed set. Each reveals different information and costs different latency. Most clients fail open when the answer cannot be fetched, since blocking would break browsing during any outage. This is the hardest unresolved part of the system: checking that is skippable on failure protects little against an attacker who can block the check.",
    k: ["Fail open vs fail closed: open preserves availability; closed protects against a blocked check but turns any status outage into a site outage.", "Per-certificate queries vs pushed sets: queries are always current but leak browsing and add latency; pushed sets are private and fast but cover only some certificates."],
    p: ["Soft-fail checking gives a false sense of safety, because an attacker on the path simply drops the status request.", "Large lists downloaded on every connection slow mobile clients and get disabled."],
    v: "Revoke a test certificate, block the status endpoint and connect with a client; record whether it connects. Then unblock and confirm a rejection within the stated update time.",
    dep: ["ocsp-responder", "crl-generation", "stapling"]
  },
  "stapling": {
    s: "A server attaches a recent signed status response to its handshake, so clients get revocation information without contacting the authority themselves.",
    d: "The server fetches a signed status response for its own certificate on a schedule, caches it until near expiry, and includes it in the TLS handshake when asked. Clients verify the signature and freshness. This removes the extra connection, protects privacy and shifts load to servers. A must-staple flag in the certificate can tell clients to demand it. The difficulty is server behavior: fetch failures, empty caches after restart and clock errors cause handshakes without a response, or with an expired one.",
    k: ["Optional stapling vs must-staple: optional never breaks connections but can be bypassed; must-staple enforces freshness but breaks sites when the fetch fails.", "Server-fetched responses vs authority-pushed: server-fetched needs no new channel; pushed gives control but needs credentials on every server."],
    p: ["A server restart clears the cache and serves handshakes without a response until the first fetch completes.", "Must-staple on a server that mishandles stapling causes self-inflicted outages."],
    v: "Inspect a handshake and confirm a status response is attached, signed, and within its validity period. Take the status service offline and confirm the server keeps serving the cached response until expiry.",
    dep: ["ocsp-responder", "ocsp-presigning"]
  },
  "sct-enforcement": {
    s: "Clients require proof that a certificate was logged publicly before they accept it, rejecting certificates without enough signed log receipts.",
    d: "A certificate carries signed receipts from several independent logs, embedded, delivered in the handshake, or stapled. The client verifies each signature against known log keys and checks that the number and diversity of logs meets its policy, which can depend on certificate lifetime. Clients may also audit logs for inclusion. This makes secret misissuance very hard, because anything the client accepts is publicly findable, but it ties issuance to the availability of logs.",
    k: ["Enforcing logging vs only recording it: enforcement forces visibility; the cost is that log outages or bugs can block issuance and acceptance.", "Embedded receipts vs delivered at handshake: embedded requires no server change but fixes the log set at issuance; delivery allows later additions at the cost of server support."],
    p: ["A certificate with too few receipts works in clients that do not enforce and fails in clients that do.", "A log that is later distrusted invalidates every certificate that relied on it alone."],
    v: "Issue a test certificate with receipts from two logs and confirm an enforcing client accepts it. Strip the receipts and confirm the same client refuses it.",
    dep: ["sct-embedding", "ct-submission"]
  },
  "cross-signing": {
    s: "One authority's key signs another authority's root or intermediate, creating a second path to trust, used to bridge old and new roots or separate hierarchies.",
    d: "A new root has no device support at first. An established root signs a certificate over the new root's public key, so clients that only know the old root still validate chains. The new root also exists self-signed for clients that include it. Servers can then offer either path. Bridge authorities use the same mechanism between organizations. The difficulty is path complexity: expiry of the cross-certificate, name constraints and clients that choose the wrong path can all produce failures.",
    k: ["Cross-signing vs waiting for root adoption: cross-signing provides immediate reach; it ties the new root's reputation and lifetime to the old one.", "Cross-certificate with constraints vs without: constraints limit bridged trust; they also cause path failures in clients that mishandle them."],
    p: ["The cross-certificate expires before the old devices are gone, breaking them on a fixed date.", "A client that prefers the longer path validates against an expired intermediate even though a good short path exists."],
    v: "Present a chain with the cross-signed intermediate to a client that only trusts the old root and to one that trusts only the new root, and confirm both validate.",
    dep: ["root-ca", "path-constraints"]
  },
  "domain-control": {
    s: "The core check that the requester controls a domain name, performed by the authority itself and recorded as evidence before any certificate for that name is issued.",
    d: "The authority gives the requester a secret token tied to their account key and asks them to publish it somewhere only the domain's controller could: a path on a web server, a DNS record, or a mail address from the domain's records. The authority then fetches or queries it and compares. The result and the evidence are stored. Hard because the internet does not authenticate DNS or routing: an attacker who can redirect traffic can pass validation for a name they do not own.",
    k: ["Proof by DNS vs by HTTP: DNS works for wildcards and servers behind firewalls; HTTP is simpler for web hosts but is limited to a single name.", "Validate every issuance vs reuse earlier proof: fresh proof limits stale control but costs time and load."],
    p: ["Trusting a single network view lets a routing or DNS attacker obtain certificates for a domain they do not own.", "Following redirects to unrelated hosts during validation accepts proof from a party who does not control the name."],
    v: "Attempt validation for a domain you do not control by placing a token on a lookalike host; confirm the authority fails it, and that a real token at the real location passes.",
    dep: ["challenge-methods", "validation-dns", "multi-perspective", "caa-checking"]
  },
  "challenge-methods": {
    s: "The defined ways a requester proves control: a file on the web server, a DNS record, a special handshake response, or an email to a registered address.",
    d: "Each method specifies exactly what the requester publishes, where, and how the authority checks. HTTP checks fetch a token at a well-known path over a fixed port. DNS checks look up a record under a reserved name. A handshake variant answers during a TLS connection on a dedicated protocol identifier. Email methods send a token to addresses derived from public records. Methods are individually allowed or disallowed by policy; each carries different risk, for example, email depends on mailbox security.",
    k: ["Many methods vs few: more methods fit more customers; each method is another attack surface that must be implemented and audited.", "Method allowed for wildcard names vs not: restricting wildcards to DNS proof ties them to control of the zone rather than one host."],
    p: ["A method that accepts a token from a shared hosting path lets another tenant claim the name.", "A DNS challenge record left behind lets later parties reuse stale proof."],
    v: "For each enabled method, issue one test validation and one with a wrong token, and confirm the right token passes and the wrong one fails with a clear reason.",
    dep: ["validation-dns"]
  },
  "multi-perspective": {
    s: "The same validation is performed from several network locations, and issuance proceeds only if enough of them agree, defeating attacks that fool only one vantage point.",
    d: "Remote vantage points in different networks and regions each perform the lookup or fetch independently and report results to the primary. A quorum rule, for example all but one agree, decides success. The point is that an attacker who hijacks routes or DNS near the authority sees only one view. Hard parts are latency, disagreement from legitimate geo-based answers, and operating many remote agents that must themselves be trusted and secured.",
    k: ["Requiring all vantage points vs a quorum: all gives the strongest guarantee; quorum tolerates a failing agent but allows one fooled view.", "Diverse networks vs cheap capacity: diversity is what defeats a routing attack; it is slower and more expensive to run."],
    p: ["Vantage points all behind the same upstream provider are fooled by one routing attack.", "Rejecting names whose servers legitimately answer differently by region frustrates real customers."],
    v: "Simulate a hijack by serving a token on a path visible only to one vantage point and confirm validation fails. Confirm a normally served token passes from all.",
    dep: ["domain-control", "validation-dns"]
  },
  "caa-checking": {
    s: "Before issuing, the authority looks up DNS records in which a domain owner lists which authorities may issue for it, and refuses if it is not listed.",
    d: "At issuance time, for each name, the authority walks up the DNS tree to find the nearest policy record, using a validating resolver and treating lookup failures carefully. The record can restrict authorities, wildcard issuance, and which validation methods or accounts may be used. A name with no policy permits any authority. Hard cases: DNS errors, aliased names, and race conditions where a record changes between the check and signing, so the check is repeated shortly before signing.",
    k: ["Fail closed vs fail open on lookup errors: closed prevents issuance when DNS is broken; open lets an attacker who can break DNS bypass the restriction.", "Check at validation only vs at signing: signing-time checks are current, but cost latency and add a dependency on DNS in the signing path."],
    p: ["Checking the policy only at order time lets a record added later be ignored.", "Caching negative answers too long ignores a policy the owner just published."],
    v: "Publish a policy listing a different authority for a test domain and confirm issuance is refused with a clear message, then remove it and confirm issuance resumes.",
    dep: ["validation-dns"]
  },
  "validation-dns": {
    s: "A dedicated, validating DNS resolver used only for validation, isolated from general infrastructure so answers can be trusted and recorded.",
    d: "Validation lookups use a recursive resolver configured for strict signature checking, no shared caches with other systems, and detailed logging of queries and answers. It enforces timeouts and limits on following aliases. Responses used as evidence are logged with their signatures when present. Hard because it sits in the path of every proof: poisoning it forges control, and a slow or unavailable resolver stops issuance entirely.",
    k: ["Dedicated resolver vs shared infrastructure: dedicated limits who can influence answers; it adds another service to run and monitor.", "Strict signature validation vs best effort: strict rejects forged answers for signed zones; best effort works with more broken zones."],
    p: ["A shared cache poisoned by unrelated traffic yields forged answers during validation.", "Missing query logs make it impossible to show an auditor what evidence supported a given certificate."],
    v: "Query a domain with an intentionally broken signature through the resolver and confirm it returns failure, and confirm every validation query is retrievable from logs by order identifier.",
    dep: []
  },
  "org-validation": {
    s: "Checks that an organization named in a certificate exists, is who it says it is, and authorized this request, using registries and independent contact points.",
    d: "Staff or software confirm the legal entity in an official registry, verify its address and operating status through a reliable third party, and confirm the requester can act for it by calling a number from an independent source. The verified details populate name fields. Results are kept for a limited period before re-verification. Hard because evidence quality varies by country, the checks are mostly manual and the information shown to users has weak value if the checks are inconsistent.",
    k: ["Independent contact sources vs requester-supplied contacts: independent sources defeat impersonation; they are slower and need regional data sources.", "Automated registry checks vs human review: automation is consistent and cheap; humans catch odd cases and are slow and variable."],
    p: ["Using a phone number from the application itself lets a fraudster verify their own fake company.", "Stale verification lets a company that has dissolved keep getting certificates with its name."],
    v: "Submit a request for a real registered entity using a requester-supplied phone number and confirm it is rejected; submit with independently sourced contact details and confirm verification completes with a recorded evidence set.",
    dep: ["validation-reuse", "blocklist-screening"]
  },
  "identity-vetting": {
    s: "Verifies a natural person's identity for certificates that name a person, using documents, live checks and records, with careful handling of the personal data collected.",
    d: "The applicant presents government identification, which is checked for authenticity and compared with a live image or in-person appearance, or confirmed through a trusted identity source. The vetting agent records what was checked, by whom and when, and the verified attributes go into the certificate. Used for signing certificates and some enterprise uses. Hard because identity documents are forged, remote checks have limits, and the authority becomes the custodian of sensitive personal data with its own legal duties.",
    k: ["In-person or live checks vs remote document checks: live checks resist forgery; remote checks scale but are weaker against sophisticated fakes.", "Keeping identity evidence vs discarding it: keeping supports audit and disputes; discarding reduces breach risk but weakens proof."],
    p: ["A vetting agent working alone can approve a fraudulent applicant, so no one-person approval should be possible.", "Retained identity scans become a breach target that is worse than the certificate fraud."],
    v: "Run a vetting with a forged document and confirm it is rejected, then run one with a valid document and confirm the record shows who verified what, with a second reviewer approving.",
    dep: ["trusted-roles", "validation-reuse"]
  },
  "validation-reuse": {
    s: "Rules for how long a completed validation can be used for further certificates before it must be proven again, and for discarding it when conditions change.",
    d: "A successful domain or organization validation is stored with a timestamp and the method used. Later orders may reuse it until it reaches a maximum age set by policy, which has shortened over time. The record is invalidated when the domain changes hands, when a related certificate is revoked for control failure, or when the method itself is retired. The difficulty is knowing when control changed: DNS gives little signal when a domain is sold, so age limits are the main safeguard.",
    k: ["Long reuse period vs short: long reduces load and friction; short limits how long a former owner's proof lasts.", "Reuse across accounts vs per account: sharing proof is convenient; per-account proof stops one customer using another's validated name."],
    p: ["A domain sold to a new owner keeps issuing certificates to the previous owner who holds old proof.", "Changing the maximum age in code without migrating stored records leaves older proofs accepted."],
    v: "Age a stored validation beyond the limit in a test environment and confirm a new order triggers fresh validation; confirm a revoked-for-control-failure name loses all reusable proof.",
    dep: ["domain-control", "org-validation"]
  },
  "blocklist-screening": {
    s: "Checks requested names and organizations against lists of high-risk, reserved, abused or previously refused names, and flags suspicious requests for review.",
    d: "Names are compared with lists of well-known brands, reserved and internal-use names, names on legal restriction lists, and names the authority has refused or revoked before. Patterns, such as lookalike characters or names that mimic payment sites, can trigger manual review. Results go to an approver rather than silently refusing, because the lists produce false positives. Hard because attackers constantly vary names, and over-blocking harms real customers and is hard to appeal.",
    k: ["Block outright vs route to human review: blocking is quick and consistent; review handles ambiguity and slows legitimate requests.", "Broad lookalike matching vs exact matching: broad catches more abuse but produces many false positives that burn reviewer time."],
    p: ["Lists that are updated by hand fall behind and let known-abused names through.", "A silent block with no reason gives customers nothing to appeal and floods support."],
    v: "Request a certificate for a name on the reserved list and one on the brand list; confirm the first is rejected and the second lands in a review queue with the matching rule shown.",
    dep: ["manual-approval"]
  },
});
