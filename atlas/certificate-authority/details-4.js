// Details for the certificate authority plate, part 4: audit and compliance, incidents and continuity, cross-cutting concerns.
ATLAS.details("certificate-authority", {
  "audit-program": {
    s: "Independent auditors examine the authority's controls and issuance records each period and publish a report that trust programs require for inclusion.",
    d: "An accredited auditor tests the authority against published criteria: policy and practice documents, key management, validation, issuance, revocation, logging and personnel. The period audit samples real certificates and events, and a point-in-time audit covers new keys. The report states the scope, the criteria and any exceptions, and is published and sent to trust programs. Hard because the audit is a sample: a clean report does not prove every certificate was right, and auditors depend on evidence the authority supplies.",
    k: ["Period audit vs point-in-time: period tests ongoing behavior; point-in-time is cheaper and shows only a moment.", "Same auditor over years vs rotating: continuity builds knowledge; rotation brings fresh eyes and a new learning cost."],
    p: ["Narrow audit scope excludes a system that later causes an incident.", "Evidence assembled just before the audit does not reflect daily practice."],
    v: "Read the latest report's scope list and confirm every production hierarchy, key and validation system appears in it, with exceptions noted and remediations tracked.",
    dep: ["baseline-compliance", "event-logging", "cp-cps"]
  },
  "baseline-compliance": {
    s: "Maps each rule from the baseline requirements and trust program policies to a specific control, owner and evidence, so compliance is traceable rather than asserted.",
    d: "The requirements are broken into numbered clauses; each clause is assigned to a control in code, configuration or procedure, with a named owner and the evidence it generates. A tracker records changes in the requirements, which are frequent, and the work to adopt them by their effective dates. The map feeds the practice statement and audit. Hard because the rules change several times a year, with deadlines that cannot slip, and the interpretation of an ambiguous clause becomes a decision to record.",
    k: ["Controls enforced in code vs enforced by procedure: code is consistent and testable; procedure covers things that cannot be automated and depends on people.", "Early adoption of upcoming rules vs at the deadline: early reduces risk and surprises customers; deadline avoids churn and compresses the work."],
    p: ["A requirement change noticed after its effective date leaves the authority noncompliant.", "Ambiguous clauses interpreted differently by two teams result in inconsistent practice."],
    v: "Choose a recent requirement change and trace it from the clause to the control, the code or procedure change, the deployed date and the evidence produced after that date.",
    dep: ["cp-cps", "change-management"]
  },
  "continuous-compliance": {
    s: "Automated scanning of issued certificates and systems for rule violations, giving early warnings between audits.",
    d: "Linters run over samples or all issued certificates, as well as over what appears in public logs. Configuration scanners compare systems with their approved state. Dashboards track violation counts, time to detect and time to fix. Findings create incidents when they mean misissuance. Hard because a monitoring system with different parsing from the issuer can disagree with it, and because every false positive needs triage while a missed real one is an incident.",
    k: ["Scan every certificate vs a sample: every certificate finds rare errors; sampling is cheaper and can miss one-in-a-million flaws.", "Alert on any violation vs on trends: any violation is strict and noisy; trends reduce noise and lose single serious events."],
    p: ["Scanner rules out of date relative to the issuer lint set produce silent gaps.", "Violations logged in a dashboard but with no owner stay open for months."],
    v: "Introduce a deliberately noncompliant certificate in a test hierarchy and confirm that the scanner flags it within the target interval and opens a tracked finding.",
    dep: ["preissuance-linting", "ct-monitoring", "issued-cert-db"]
  },
  "root-program-engagement": {
    s: "The ongoing relationship with trust store operators: applications, annual reports, responses to questions, incident reports and changes to roots or policies.",
    d: "Programs require notification of new hierarchies and significant changes, the audit reports, and prompt incident reports that are discussed publicly. Staff track each program's policy updates and public discussion lists, and respond to questions on issues raised by community members. Decisions in these forums can limit or remove a root. Hard because each program has different forms, rules and tempo, and public criticism of an authority's conduct can cost it trust as quickly as a technical failure.",
    k: ["Proactive disclosure of problems vs minimum required: proactive builds trust and reveals embarrassing detail; minimum limits exposure and risks being seen as hiding.", "Dedicated compliance staff vs engineers: dedicated staff keep consistency; engineers know the facts and can be pulled away from other work."],
    p: ["A missed program deadline for a report puts roots at risk.", "Incident answers that are vague or defensive draw a sharper response than the original problem."],
    v: "Check that each program's current requirements, last report and open questions are tracked with owners and due dates, and that all open public threads have a recent response.",
    dep: ["audit-program", "incident-reports"]
  },
  "event-logging": {
    s: "Capture and retain records of validation, issuance, key operations, access and administration, in tamper-evident storage, for the period the rules require.",
    d: "Systems send structured events to a central store, which timestamps them from a trusted time source, protects them against alteration and retains them for years. Records include validation evidence, approvals, key operations, administrator actions and physical access. Retention periods differ by record type and jurisdiction. Hard because the volume is high, sensitive information appears in the logs, and an auditor must be able to reconstruct the history of any single certificate on request.",
    k: ["Central write-once store vs per-system logs: central is hard to tamper with and a target; per-system is simple and fragmented.", "Long retention of everything vs tiered retention: everything is simple and costly; tiers cut cost and demand correct classification."],
    p: ["Time sources that drift make events impossible to order across systems.", "Logs that include private data become a liability that is out of line with their access controls."],
    v: "Pick one issued certificate and retrieve its complete history from logs: request, validation evidence, lint result, approvals, signing and publication, each with a trustworthy timestamp.",
    dep: ["issued-cert-db"]
  },
  "trusted-roles": {
    s: "Named roles with defined powers and separation, such as administrators, officers, auditors and operators, so no single person can both perform and approve a sensitive action.",
    d: "Roles are defined in policy and assigned to vetted people; each role grants specific capabilities, and conflicts are forbidden, for example the person who administers systems cannot be the one who audits them. Sensitive operations need two roles. Assignments are reviewed regularly, and access is removed promptly when people change duties or leave. Hard because small teams struggle to staff separate roles, and because convenience pushes people toward shared or elevated access.",
    k: ["Strict separation of roles vs flexible assignment: strict prevents single-person abuse; flexible works for small teams and weakens the control.", "Role-based access enforced by systems vs by policy: systems enforce consistently; policy depends on people following it."],
    p: ["An administrator who also holds an audit role can hide their own actions.", "Departed staff retaining credentials is found at the next audit."],
    v: "Pull the role assignment list and cross-check it against system access: confirm no person holds conflicting roles and no credentials exist for people not on the current list.",
    dep: ["event-logging"]
  },
  "change-management": {
    s: "A controlled process for changes to systems that affect issuance or keys: review, testing, approval, scheduled deployment and recorded results, with an emergency path that is also recorded.",
    d: "Changes are described, risk rated, tested in staging, reviewed by an independent person and deployed from versioned artifacts. Production configuration is compared with approved state regularly to find drift. Emergency changes follow a shorter path and are reviewed afterwards. Records link each deployed change to a ticket and approvals. Hard because the process must be strict for the few components that matter and fast for the many that do not, and misclassifying risk is the usual failure.",
    k: ["Strict gate on all changes vs risk-tiered: strict is uniform and slow; tiering is efficient and depends on honest classification.", "Automated deployment from reviewed code vs manual changes: automation is repeatable and auditable; manual allows quick fixes and leaves no trace."],
    p: ["A hotfix that never gets its retrospective review stays in production unexamined.", "Configuration drift means production no longer matches what was tested."],
    v: "Pick three production changes and confirm each links to a ticket, review, test result and deployment record; run a drift report and confirm production equals the approved configuration.",
    dep: ["event-logging"]
  },
  "incident-response": {
    s: "The standing plan and team for detecting, triaging, containing and resolving security and compliance incidents, with clear roles, timelines and communication.",
    d: "Signals from monitoring, reports from outsiders and audits feed a triage step that classifies severity and starts a clock. Responders contain the problem, preserve evidence, decide on revocation, fix the cause and prepare public reporting. The plan names who decides, who talks to trust programs and customers, and how to work when normal systems are down. Hard because incidents are rare, high pressure and public, so practiced drills matter, and because the deadlines in the rules start at discovery.",
    k: ["Dedicated on-call incident team vs engineers pulled in: dedicated gets fast response and costs staff; pulled-in engineers have context and are slower to assemble.", "Centralized decision authority vs distributed: central decides quickly and consistently; distributed is resilient and slower to align."],
    p: ["A plan that no one has rehearsed fails on the first step, such as finding who may revoke.", "Evidence overwritten during rapid fixes makes root cause analysis impossible."],
    v: "Run a tabletop drill with a realistic scenario and measure time to classify, time to decide on revocation and time to draft the report; compare with the targets in the plan.",
    dep: ["misissuance-response", "key-compromise-response", "problem-reporting", "incident-reports"]
  },
  "misissuance-response": {
    s: "The specific procedure for when a certificate was issued that violates the rules: confirm, revoke on deadline, find the cause, find every similar certificate and fix the pipeline.",
    d: "On a report or detection, staff verify with the linter and records, identify every certificate with the same flaw by querying the issued database, and revoke those that require it within the deadline. The root cause, often a profile, parsing or validation bug, is fixed and a test added so it cannot recur. A report is published with a timeline. Hard because the revocation deadlines are short and revoking breaks real sites, while the scope of the flaw is often larger than first reported.",
    k: ["Stop issuance until the flaw is fixed vs continue with the flaw known: stopping prevents more bad certificates and causes outages; continuing breaks the rules knowingly.", "Query-based scoping vs sampling: queries find all affected certificates; sampling is faster and can miss some."],
    p: ["Fixing the one reported case without searching for others leaves identical problems and creates a repeat incident.", "A fix deployed without a regression test lets the same flaw return."],
    v: "Replay a past misissuance scenario in staging: confirm the linter now blocks it, the query returns every affected certificate and the bulk revocation completes within the deadline.",
    dep: ["issued-cert-db", "mass-revocation", "preissuance-linting"]
  },
  "key-compromise-response": {
    s: "The procedure when an authority's own key, or a subscriber's key, is believed exposed: stop use, revoke, replace, reissue and notify, within hours.",
    d: "For an issuing key: suspend signing with it, revoke it from the parent, activate a replacement, reissue affected certificates as needed and publish the revocation widely. For a root, the response includes working with trust programs to remove it and distribute a new one, which takes a long time. For subscriber keys, the authority revokes on proof, including a signed demonstration or a published key. Hard because the blast radius is every certificate under the key, and hierarchy design determines whether it is thousands or millions.",
    k: ["Replace the key immediately vs investigate first: immediate replacement limits abuse; investigating first preserves evidence and allows more exposure.", "Pre-positioned standby intermediates vs created on demand: standby allows replacement in hours; on-demand needs a ceremony and days."],
    p: ["A standby key never tested cannot sign when needed.", "Revoking an intermediate without a ready replacement stops issuance for days."],
    v: "Rehearse a compromise of one issuing key: revoke it, switch to the standby and confirm new certificates chain correctly in clients within the targeted time.",
    dep: ["rollover", "mass-revocation", "root-ca", "intermediate-ca"]
  },
  "problem-reporting": {
    s: "A public, always-monitored channel through which anyone can report suspected key compromise, misuse or misissuance, with a commitment to respond within a stated time.",
    d: "The channel is an address and a form, listed in the practice statement, and it is monitored around the clock. Reports are triaged by trained staff, acknowledged quickly and linked to cases. Security researchers may provide evidence such as key files, which are verified automatically where possible. Hard because the channel receives spam and false reports at volume, and a single real report in the noise has a deadline that starts on receipt.",
    k: ["Automated verification of compromise proofs vs manual: automated meets deadlines at any hour; manual allows judgment and delays the clock.", "Public form vs email only: a form structures the data and attracts abuse; email is easy and unstructured."],
    p: ["Reports sent to an unattended mailbox over a weekend miss a one-day deadline.", "Auto-closing duplicate reports hides new evidence."],
    v: "Send a test report at an odd hour and confirm acknowledgment, a case with a deadline, and staff assigned within the stated time.",
    dep: ["revocation-intake", "incident-response"]
  },
  "disaster-recovery": {
    s: "Plans and infrastructure to restore issuance and status services after loss of a site, data store or key hardware, with defined recovery time and data loss limits.",
    d: "Databases replicate across sites, hardware and backups are held in separate locations and runbooks describe each step from loss of a site to restart. Status services have the strictest targets because clients depend on them continuously; issuance can pause longer. Exercises restore from backup into a clean environment. Hard because recovery involves keys, which need credential holders in the right places, and because a restore may roll back records of certificates that are still valid.",
    k: ["Hot standby site vs cold: hot recovers in minutes and costs double; cold is cheap and recovers in days.", "Prioritize status over issuance vs equal: status first keeps existing certificates working; equal treatment is simpler and risks both failing."],
    p: ["A restore that drops recent certificates loses revocation data for live certificates.", "Credentials needed for recovery stored only in the failed site."],
    v: "In an exercise, fail the primary site, restore services in the secondary and confirm status responses stay valid, issuance resumes, and the certificate database matches public logs afterwards.",
    dep: ["issued-cert-db", "key-backup", "signing-availability", "status-cdn"]
  },
  "service-monitoring": {
    s: "Measurement of availability, latency and correctness of issuance and status services, with alerts and published targets, so failures are found before customers or clients find them.",
    d: "Probes issue test certificates, validate challenges, fetch lists and query status from several locations on a schedule, checking correctness as well as response. Metrics track queue depth, signing latency, log submission time and list freshness. Service targets are set for status and issuance and tied to alerts. Hard because the failure that matters is silent: a list that stops updating still returns 200 and looks healthy until it expires.",
    k: ["Synthetic end-to-end probes vs component metrics: probes show what customers see; metrics locate the cause.", "Alert on freshness of artifacts vs only availability: freshness catches silent stalls; availability is simpler and misses them."],
    p: ["Monitoring that checks only that a list can be downloaded misses that it has stopped changing.", "Alert thresholds tuned only to avoid noise miss slow degradation."],
    v: "Stop the list generation job in staging and confirm an alert fires on staleness well before next-update, and confirm probes report certificate issuance end to end from several regions.",
    dep: ["crl-generation", "ocsp-responder", "acme-server", "status-cdn"]
  },
  "incident-reports": {
    s: "Public written reports on each incident with timeline, impact, root cause and fixes, published by deadlines and kept in a standard form for trust programs and the community.",
    d: "A report states what happened, how it was found, which certificates were affected, how many were revoked and when, why it happened and what will change. Follow-up reports track the promised fixes through to completion. Reports are posted to the program forums where the community comments. Hard because accuracy is more valuable than speed but deadlines apply, and because incomplete or self-serving reports are noticed by experienced reviewers and cost more trust than the incident.",
    k: ["Full detail including mistakes vs summary: full detail earns credibility and may expose the authority to criticism; summary is safe and looks evasive.", "Publish early with updates vs wait for completeness: early meets expectations and may later need correction; waiting is accurate and late."],
    p: ["Fixes promised in a report and never tracked reappear as repeat incidents.", "Numbers in a report that later turn out wrong damage credibility."],
    v: "For a past incident, check that the report was posted within the deadline, that the affected-certificate count matches the database, and that each promised action has a completed ticket.",
    dep: ["issued-cert-db", "root-program-engagement"]
  },
  "public-vs-internal": {
    s: "Whether the authority serves the open internet under shared trust rules, or only an organization's own systems under its own rules, which changes nearly every requirement.",
    d: "A public authority must be accepted into trust stores, follow common requirements, validate names against the public naming system, log all certificates publicly and pass audits. An internal authority chooses its own names, profiles and lifetimes, trusts roots it distributes itself, and can revoke or reissue everything on its own timetable. Internal authorities often serve devices, services and people; they skip the audit program and carry no external accountability. Hard because internal authorities drift into public risk when their roots are trusted widely, and their weaker controls then matter.",
    k: ["Public authority for internal services vs private authority: public avoids distributing a root and exposes internal names in public logs; private keeps names private and requires managing trust on every client.", "Strict internal rules matching public ones vs relaxed: strict eases a later move and costs effort; relaxed is simple and risky."],
    p: ["An internal root installed on devices that later leave the organization remains trusted outside it.", "Internal authorities with no audit or monitoring accumulate unnoticed misissuance."],
    v: "List every trust anchor installed on managed devices and confirm each has an owner, a documented purpose and constraints limiting it to the intended names.",
    dep: ["trust-stores", "ct-submission", "audit-program"]
  },
  "certificate-lifetimes": {
    s: "How long certificates are valid. It sets the balance between revocation, which is slow and unreliable, and renewal automation, which must then be perfect.",
    d: "Longer lifetimes mean fewer renewals and a longer window in which a stolen key or outdated information stays trusted, so revocation carries more of the security burden. Shorter lifetimes make expiry do that work but depend on automation at both ends and on high availability of issuance. The lifetime influences list sizes, log volume, validation reuse windows and how much damage a mass revocation does. Hard because the right value differs by use and moves over time.",
    k: ["Short lifetimes vs long with revocation: short removes dependence on revocation checking; long keeps manual customers working.", "Uniform lifetime for everyone vs by customer capability: uniform is simple and fair; by capability suits those without automation and splits the ecosystem."],
    p: ["Shortening lifetimes without checking customers' renewal automation causes outages at scale.", "Long lifetimes for devices that cannot update leave stale trust for years."],
    v: "Measure the distribution of lifetimes and the share of certificates renewed by automation, and confirm the oldest remaining unrevoked certificate is within policy.",
    dep: ["validity-policy", "short-lived-certs", "revocation-checking"]
  },
  "cryptographic-agility": {
    s: "The design discipline of making algorithms, key sizes and formats replaceable, because every signature algorithm eventually weakens and certificates outlive many assumptions.",
    d: "Algorithms appear in keys, signatures, hashes, hardware, protocols and client software. Agility means each can change with bounded work: separated hierarchies per algorithm, profiles that name algorithms as data, hardware that supports more than one, and measurements of client support. It also means knowing which parts cannot change quickly: roots and embedded devices. Hard because agility has costs, such as downgrade attacks and a larger test matrix, and because the slowest participant sets the pace.",
    k: ["Support several algorithms at once vs one at a time: several allow gradual migration and raise complexity and downgrade risk; one is simple and forces flag days.", "Early migration vs waiting for clear standards: early protects against future breaks and may choose wrongly; waiting risks being late."],
    p: ["Hard-coded algorithm choices in tools mean a migration touches many unrelated systems.", "Support for new algorithms added without negotiation lets attackers force old ones."],
    v: "Inventory every use of each algorithm in keys, signatures, hardware and clients, and confirm that each has a documented replacement plan and a tested path to switch.",
    dep: ["algorithm-agility", "key-requirements", "hsm-cluster"]
  },
  "key-custody-model": {
    s: "Where private keys live and who can use them: offline, online in hardware, delegated to others or held by subscribers, which sets how much any one failure can cost.",
    d: "The model decides which keys are offline and which are online, which sit in dedicated hardware, which live with customers and which with third parties who operate subordinate authorities. Each choice trades convenience against exposure. Custody also covers backups, activation credentials and recovery. A decision to let a third party hold an issuing key extends the audit boundary to them. Hard because custody decisions are baked into the hierarchy and cannot be easily changed after certificates are issued.",
    k: ["Keys in the authority's hardware vs in customer's own: authority-held gives control and responsibility; customer-held distributes risk and weakens oversight.", "Delegated subordinate authorities vs one central authority: delegation scales and spreads risk across operators; central is simpler to audit."],
    p: ["Third-party subordinate authorities with weak controls inherit the root's reputation.", "Online keys without hardware protection are copied by anyone who gets in."],
    v: "Produce a map showing, for every key, its location, custodian, protection and activation method, and confirm it matches what hardware attestation and access records show.",
    dep: ["hsm-cluster", "root-ca", "m-of-n-activation"]
  },
  "blast-radius": {
    s: "How much breaks when one component fails or is compromised, shaped by hierarchy design, key separation, constraints and the speed at which trust can be withdrawn.",
    d: "A flaw in validation affects every certificate issued with it; a compromised intermediate affects everything it signed; a compromised root affects everything. The design limits this with several intermediates, constrained subordinates, separated hierarchies, independent re-checking in the signer, and short lifetimes. Planning asks, for each component, how many certificates would need revoking and how long replacement would take. Hard because the answer depends on interactions and is rarely measured until an incident.",
    k: ["Many small hierarchies vs few large: small limits each failure and multiplies operations; large is efficient and makes each failure severe.", "Independent controls at each stage vs a single strong control: independent stages catch what others miss at a cost in duplication; one strong control is simple and a single point of failure."],
    p: ["Hierarchy planned for efficiency alone discovers in an incident that one key signs most traffic.", "Assuming a control cannot fail leaves no second line behind it."],
    v: "For each issuing key, compute how many live certificates it signed and how long a rehearsed replacement takes, and confirm both figures are within the risk limits the organization accepted.",
    dep: ["hierarchy-segmentation", "path-constraints", "signing-policy", "mass-revocation"]
  },
  "auditability-by-design": {
    s: "Building systems so that outsiders can verify what they did, using evidence generated automatically at the moment of action instead of reconstructed later.",
    d: "Trust in an authority cannot rest on its word. Validation evidence is stored with each certificate, signing is logged outside the signer, issuance is published to public logs, and procedures leave signed records. The design means each claim in the practice statement has a record that proves it. Evidence formats are chosen early because retrofitting is nearly impossible. Hard because evidence costs storage and complexity, and because systems that generate records but never test them produce confident, wrong audits.",
    k: ["Evidence recorded at the time of action vs collected for the audit: recorded is trustworthy and costs always; collected is cheap and can be forged or incomplete.", "Public transparency vs private audit only: public lets anyone find errors; private audit limits what is exposed and relies on auditors."],
    p: ["Evidence kept in systems an administrator can edit proves nothing.", "Records that exist but cannot be retrieved for a single certificate fail the audit sample."],
    v: "Pick random certificates and reconstruct from stored records alone the validation evidence, approvals, lint result, signing event and log entry, without asking any staff member.",
    dep: ["event-logging", "signing-audit-log", "ct-submission", "issued-cert-db"]
  },
});
