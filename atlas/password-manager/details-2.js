// Details for the password manager plate, part 2: generation and hygiene, vault items, passkeys and second factors.
ATLAS.details("password-manager", {
  "password-generator": {
    s: "Creates random passwords from a configurable length and character set using a secure random source, so each account gets a unique credential nobody has to remember.",
    d: "The generator draws each character by uniform selection from the allowed set, using rejection sampling to avoid bias from modulo arithmetic. Options set length, character classes, excluded look-alike characters and per-site rules such as a required symbol. It may guarantee at least one of each class. The challenge is that sites impose inconsistent restrictions, such as a maximum length or banned symbols, and a generator that silently truncates or alters the result produces a stored password that does not match the one the site accepted.",
    k: ["Guaranteeing one character per class vs pure uniform draw: it satisfies naive site rules, but slightly shrinks the possible space and reveals a pattern in what is excluded.", "Long default length vs site-friendly short one: length gives more entropy per character class, but sites with low maximums reject it and people then fall back to weak choices."],
    p: ["Modulo bias from drawing a random byte and reducing it favors some characters and quietly lowers entropy.", "A site silently truncates a long password, and the stored full-length value never works again."],
    v: "Generate one million passwords with fixed options and confirm each character appears at a frequency within statistical bounds of uniform, and every output satisfies the selected class and length rules.",
    dep: ["random-generation", "strength-estimation"]
  },
  "passphrase-generator": {
    s: "Builds a memorable secret from several words drawn at random from a fixed list, giving strong entropy that a person can actually type and recall.",
    d: "It picks words uniformly from a list of known size, such as several thousand entries, optionally separating them and adding a number or capital letter for site rules. Entropy is the word count times the log of the list size, so the list and count are both public and matter. It is used for the master password, where memorability counts, and for devices where typing symbols is painful. The challenge is list quality: words must be unambiguous, easy to spell and hard to confuse, and a short word list weakens each word.",
    k: ["Word list of a few thousand vs tens of thousands: a bigger list gives more entropy per word, but includes rare or ambiguous words that people mistype.", "Adding a number or capital vs adding another word: a decoration satisfies site rules cheaply, while another word adds real entropy and is no harder to remember."],
    p: ["Letting the person re-roll until a phrase looks nice biases the choice and lowers real entropy.", "A custom shortened list is used and the displayed strength is computed as if the full list were in use."],
    v: "Generate a large sample, confirm every word comes from the list with uniform frequency, and confirm the displayed entropy equals word count times log base two of the actual list size.",
    dep: ["random-generation", "strength-estimation"]
  },
  "alias-generator": {
    s: "Produces a unique username or forwarding email address for each site so one breach cannot be linked to the person's other accounts.",
    d: "It generates a random username, or a plus-addressed or subdomain variant of the person's own address, or asks an email forwarding service for a fresh alias that relays to the real inbox. Each alias is saved with the item that uses it. When a site leaks or sells the address, the alias can be disabled without touching the real one. The challenge is third-party dependence: forwarding services are separate trust and availability dependencies, and sites increasingly reject plus-addressing.",
    k: ["Forwarding aliases vs plus-addressing: forwarding hides the real address and can be turned off, but depends on another provider; plus-addressing is free but trivially reversed.", "Per-site alias by default vs opt-in: it protects more accounts, but complicates account recovery when the person forgets which alias they used."],
    p: ["The alias provider shuts down and every account tied to its addresses becomes unrecoverable.", "A generated alias is not saved with the item, so the person cannot log in later."],
    v: "Create an account with a generated alias, then send mail to it and confirm it arrives in the real inbox. Disable the alias and confirm further mail is rejected while the real address still works.",
    dep: ["item-schema", "password-generator"]
  },
  "strength-estimation": {
    s: "Estimates how long an attacker would need to guess a password, using patterns, dictionaries and keyboard walks instead of a simple count of character classes.",
    d: "A pattern-matching estimator splits the password into recognizable pieces such as dictionary words, names, dates, repeats, sequences and keyboard runs, then computes the cheapest guess path an attacker would use. The result becomes a score or a time estimate against stated attack speeds. It is shown while the person chooses a master password and in the vault health report. The difficulty is calibration: the estimate is a model of a particular attacker, and a password built from leaked-list phrases is far weaker than its length suggests.",
    k: ["Pattern-based estimation vs character-class rules: it rates passwords closer to how attackers guess, but needs large dictionaries shipped to the client and kept current.", "Estimate computed locally vs checked against a server: local keeps the password private, but cannot know which passwords are widely used in real breaches."],
    p: ["A meter rates a famous quotation as strong because the estimator has no entry for it.", "Showing a high score for a password with known breaches reassures the person falsely."],
    v: "Feed a labeled set of known-weak passwords, such as common words with substitutions, and strong random strings, and confirm every weak one scores below a set threshold and the random ones above.",
    dep: ["client-core-library"]
  },
  "reuse-detection": {
    s: "Finds passwords used on more than one account by comparing items inside the unlocked vault, without sending any password anywhere.",
    d: "After decryption, the client groups items by password value, usually by hashing each in memory and comparing, and flags groups with more than one site. It can also detect near duplicates by comparing normalized forms. Results appear in the health report and may prompt a change at sign-in. Because it happens locally, the server learns nothing. The hard part is deciding what counts as a different account: a company's several domains share one login on purpose, and flagging them is noise.",
    k: ["Local comparison vs a server-side check: nothing leaves the device, but only the person's own vault is covered and no cross-user signals are available.", "Flag only exact matches vs near duplicates: exact is precise, while near duplicates catch a base password with a number appended, with more false alarms."],
    p: ["Hashes kept in memory for comparison persist after the report closes and extend the plaintext lifetime.", "A site family sharing one login is flagged every time, and people learn to ignore the warning."],
    v: "Create three items with the same password and one with a one-character variation, run the check, and confirm the three are reported as a group, the variant is separate, and no network request carries any password.",
    dep: ["item-schema", "vault-health-report"]
  },
  "breach-monitoring": {
    s: "Checks stored passwords and addresses against known breach corpora without revealing them, using a range query that sends only a short hash prefix.",
    d: "The client hashes a password, sends the first few characters of the hash to a lookup service, and receives every hash suffix in that bucket, then compares locally. This k-anonymity scheme lets the service return matches without learning which password was checked. Email exposure checks work similarly but may need the address itself, so they are often opt-in. Results flag items for change. It is hard because breach data is large and constantly growing, and each lookup still leaks a small amount.",
    k: ["Hash-prefix range query vs sending a full hash: the service cannot tell which password was checked, but each response is large and the prefix still narrows the candidates.", "Automatic background checks vs on demand: automatic finds problems sooner, but generates steady network traffic that reveals the person uses the product and how often."],
    p: ["Sending the full hash, or a prefix too long, lets the service or an observer recover the password by dictionary attack.", "A stale corpus reports an old breach as new and trains people to ignore alerts."],
    v: "Check a known-breached test password with a proxy in the path and confirm only a five-character hash prefix is sent, and that the client finds the matching suffix in the returned list.",
    dep: ["breach-range-service", "vault-health-report", "api-gateway"]
  },
  "vault-health-report": {
    s: "A summary of weak, reused, exposed, old and unprotected items in the vault, with a prioritized list of what to change first.",
    d: "The client decrypts all items locally and runs checks: strength estimate, reuse groups, breach results, passwords unchanged for years, sites that support a second factor but have none set, and sites on unencrypted addresses. It scores and ranks by account importance. Organization versions aggregate counts without passwords, which requires either member-side reporting or per-member local checks. The challenge is turning findings into action: a long red list is ignored, so good reports guide a few changes at a time.",
    k: ["Computed on each client vs on the server: local keeps zero knowledge and is always current, but organizations cannot see aggregates without clients reporting them.", "Ranking by account importance vs a flat list: ranking drives action, but depends on a guess about which accounts matter, such as email and banking."],
    p: ["A report that lists hundreds of issues at once overwhelms people and nothing changes.", "Organization reports built from member plaintext summaries leak weak passwords to administrators."],
    v: "Seed a vault with known weak, reused and breached items, run the report and confirm each appears under the right heading, then change one and confirm it disappears and the score improves.",
    dep: ["strength-estimation", "reuse-detection", "breach-monitoring", "item-schema"]
  },
  "item-schema": {
    s: "The typed structure of a vault record: its type, name, fields, match rules, notes, custom fields and metadata, written so old and new clients can both read it.",
    d: "Each item has a type such as login, card, identity, note or key, and fields appropriate to it. Common parts include a name, one or more match rules, a secret, a one-time code seed, notes and a modification time. Fields are stored as named values, so new types can be added without a migration of old ones. Readers ignore fields they do not know and writers preserve them. The challenge is evolving the schema without breaking old clients, losing unknown data on save, or turning every item into free text.",
    k: ["Fixed types with custom fields vs fully free-form items: types give predictable fill and import behavior, but force awkward mapping for data that fits none of them.", "Preserving unknown fields on write vs dropping them: preserving keeps newer clients' data intact when an older client edits, but allows junk to accumulate."],
    p: ["An old client edits an item and drops fields it does not understand, destroying data the newer client created.", "Ambiguous field names are mapped differently by import tools and different clients disagree on what a field means."],
    v: "Create an item with a field from a newer schema version, edit and save it in an older client, then reopen in the newer one and confirm the unknown field survived unchanged.",
    dep: ["vault-format", "format-versioning"]
  },
  "folders-and-tags": {
    s: "The organizing structure for items: folders, tags and favorites that people use to find things, stored encrypted like the items themselves.",
    d: "A folder name is an encrypted string with its own identifier, and each item references it. Because the server cannot read names, it cannot sort or filter by them, so the client does all grouping after decryption. Shared collections add a second axis owned by the organization rather than the person. Nesting is built by a path convention in the name. The challenge is keeping the structure consistent across offline edits and imports, and mapping personal folders to organizational collections when items are moved between them.",
    k: ["Encrypted folder names vs plaintext for server-side filtering: encryption hides how the person organizes their life, but all filtering and counts must run in the client.", "Folders as a single hierarchy vs free tags: folders are simple to understand, while tags let one item belong to several groups but make navigation less predictable."],
    p: ["Two devices rename the same folder offline and the merge creates two near-identical folders.", "Moving an item into a shared collection changes who can see it, and people forget that the move is also a disclosure."],
    v: "Create a nested folder offline on two devices with the same name, sync both and confirm the result is a single deterministic folder or a visible duplicate, and that the server cannot show folder names in a database dump.",
    dep: ["item-schema", "conflict-resolution"]
  },
  "secure-notes-and-cards": {
    s: "Item types for payment cards, identities, software keys and free-text notes, with fields that autofill can use and a stronger default of asking before sharing them.",
    d: "A card item has a number, holder, expiry and code, and autofill fills checkout forms by matching field names and autocomplete hints. An identity holds name, addresses and document numbers for form fill. A note holds text, sometimes with structured templates. Because these are high-value and often reused across sites, clients can require unlock again before revealing them. The challenge is form fill accuracy on checkout pages, and the fact that holding payment data also brings compliance questions and a larger target.",
    k: ["Require re-authentication before reveal vs trust the unlocked session: re-prompting limits what a walk-up attacker or hijacked session can read, but adds friction to routine checkout.", "Structured types vs notes only: structure enables autofill and masking, but needs maintenance as forms and document formats change."],
    p: ["A card code is fillable into a page that only claims to be a checkout, and a lookalike site collects it.", "Notes used for recovery phrases end up unprotected in exports or screenshots because they look like plain text."],
    v: "Store a test card, open a checkout page, and confirm fill requires re-authentication and populates number, expiry and code correctly. Confirm the card number never appears in logs or unencrypted exports.",
    dep: ["item-schema", "autofill-injection", "unlock-and-timeouts"]
  },
  "attachments": {
    s: "Files attached to vault items, such as recovery documents and keys, each encrypted under its own key and stored as a separate blob.",
    d: "Each attachment gets a fresh random key, the file is encrypted in chunks, and the key is stored in the item, which is itself encrypted. The server stores only the ciphertext and a size. Download decrypts in the client, ideally streaming. Limits are enforced by size and plan. This design means deleting the item removes the only copy of the key. The difficulty is size: large files strain memory, interrupted uploads need resumption, and chunk order and length must be authenticated so an attacker cannot truncate or reorder a file.",
    k: ["Per-file key vs the item's key: a separate key allows sharing one file without the rest and rotating it alone, but adds a second wrapped key to track.", "Chunked authenticated encryption vs one pass: chunking permits streaming and resumption, but each chunk needs an index and a final marker to detect truncation."],
    p: ["Chunks authenticated individually but not by position let an attacker drop the end of a file unnoticed.", "A file is uploaded before its item is saved, and an interruption leaves an orphan blob that is never removed."],
    v: "Upload a large file, cut the connection at several points, and confirm resume works. Remove the last chunk on the server and confirm the client refuses to open the file instead of returning a truncated one.",
    dep: ["authenticated-encryption", "per-item-keys", "ciphertext-store"]
  },
  "item-history": {
    s: "Keeps earlier versions of an item's password and a trash area for deleted items, so a bad edit or accidental deletion can be undone.",
    d: "When a password changes, the old value is appended to an encrypted history list in the item. Deleted items are flagged and moved to a trash area for a retention period before permanent removal. A restore copies a prior value back as current. History and trash are encrypted like the item. Retention involves a trade-off: old passwords may still be valuable if a site's change failed, but they are also stale secrets that survive a breach response. Permanent deletion must propagate to every device and any server snapshots.",
    k: ["Keeping password history vs only the current value: history rescues from failed or mistaken changes, but retains secrets that a thorough response would remove.", "Trash with a retention window vs immediate deletion: it saves from mistakes, but means a deleted secret stays recoverable, and stored in backups, for weeks."],
    p: ["Permanent delete removes an item on one device while an offline device later uploads it again, resurrecting it.", "History grows without bound on frequently rotated items and bloats sync payloads."],
    v: "Change a password three times and confirm history lists the three prior values. Delete the item, wait past retention and confirm it is gone on all devices and that the ciphertext is absent from the server store.",
    dep: ["item-schema", "conflict-resolution", "revision-tracking"]
  },
  "import-export": {
    s: "Moves vault data in from other managers and browsers and out as files, with formats and warnings that make clear what protection the exported copy has.",
    d: "Import parses many formats, maps their fields onto the item schema and reports what it could not map. Export writes either plain text formats, which expose everything, or an encrypted file protected by a password and derivation parameters stored in the file. Both can take a long time on large vaults and must not exhaust memory. The difficulty is fidelity and risk: each source format is inconsistent, field mapping loses data silently, and an unencrypted export left in a download folder is among the most common ways vaults leak.",
    k: ["Encrypted export by default vs plain on request: encrypted files stay safer on disk, but are not readable by other tools, which is what people usually want an export for.", "Strict import that rejects unknown fields vs lenient mapping: strict avoids silent loss, but fails on many real-world files, so most clients map leniently and show a report."],
    p: ["A plain-text export sits in the downloads folder and is synced by a cloud service, which now holds every password.", "Import maps a username field into notes and the person finds out only when fill stops working."],
    v: "Import a file from another manager with a known item count and confirm every item and custom field is present or listed in the report. Export, then confirm a plain export triggers a warning and an encrypted one cannot be read without the password.",
    dep: ["item-schema", "authenticated-encryption", "master-key-derivation"]
  },
  "search-index": {
    s: "A local index of decrypted item names and fields that makes vault search instant, built in memory and discarded when the vault locks.",
    d: "After unlock the client decrypts the fields people search, usually names, usernames and match addresses, and builds an in-memory index, with ranking boosts for matches on the current page. The index is never written to disk in plaintext and is dropped on lock. The server never sees queries, because it cannot read the data. Searching secret fields is deliberately excluded. The challenge is balance: indexing more fields helps find things but widens what lives in memory, and large vaults make rebuild on every unlock slow on a phone.",
    k: ["In-memory index rebuilt at unlock vs persisted encrypted index: memory-only leaves nothing on disk, but pays a rebuild cost on every unlock for large vaults.", "Search all fields vs names only: more fields find more items, but notes and custom fields may contain secrets that should stay out of an easily dumped structure."],
    p: ["A persisted index written for speed holds plaintext names and survives lock.", "The index is not invalidated when an item changes in sync and shows stale results."],
    v: "Lock the vault, dump the process memory and disk and confirm no index terms from item names are present. Unlock, search a known item by name and confirm it returns in under a few hundred milliseconds.",
    dep: ["item-schema", "memory-hygiene"]
  },
  "passkey-storage": {
    s: "Holds the private keys of passkeys as encrypted vault items, so a credential created on one device can sign in from any device the person has unlocked.",
    d: "On registration the manager generates a key pair, sends the public key and an identifier to the site, and stores the private key with the site's identifier, user handle and counters in an encrypted item. During authentication it finds the item by site, shows the choice and signs the site's challenge. Because the key is in the vault it synchronizes like other items. The challenge is that private keys are non-extractable on device-bound authenticators but not here, so the security now equals the vault's, and the manager must refuse to sign for the wrong site.",
    k: ["Synced key in the vault vs device-bound key: sync survives device loss and eases migration, but makes the vault the only protection and lets a vault breach expose every key.", "Discoverable credentials stored with user handle vs server-held lists: discoverable ones allow username-free sign-in, but use more vault space and need careful account selection."],
    p: ["The manager signs a challenge for a site whose identifier does not match, because origin binding was not enforced.", "A restored backup contains an older counter or key set and the site rejects the credential."],
    v: "Register a passkey on a test site, delete the local device cache, sign in from a second device and confirm success. Attempt a login from a lookalike origin and confirm the manager refuses to sign.",
    dep: ["webauthn-ceremony", "item-schema", "authenticated-encryption"]
  },
  "webauthn-ceremony": {
    s: "Implements the registration and authentication steps that the browser and sites expect, including challenge signing, origin binding and the data the site verifies.",
    d: "The extension intercepts the page's credential creation and request calls, or the platform's credential provider interface does, and answers on behalf of the manager. It builds the client data with the site's origin and challenge, produces authenticator data with flags and a counter, and signs them. It must report capabilities honestly, such as user verification and resident key support, and may decline so the browser falls back to another authenticator. The challenge is faithful compliance across site variations, and the fact that intercepting browser calls is itself a sensitive position.",
    k: ["Intercept page calls vs implement the platform provider interface: interception works in any browser, but is fragile and must be careful not to break native flows; provider interfaces are safer where supported.", "Always require user verification vs honor the site's request: always requiring it is safer, but some sites ask for none and expect a fast path."],
    p: ["The manager claims user verification it did not perform, so the site records a stronger assurance than happened.", "Intercepting calls on a page where the person wants their hardware key prevents it from being used."],
    v: "Run an interoperability test suite against several test relying parties covering registration, sign-in, user verification flags and counters, and confirm each server-side verification passes, with a wrong-origin attempt failing.",
    dep: ["passkey-storage", "browser-extension", "origin-matching"]
  },
  "passkey-sync": {
    s: "Moves passkey private keys between a person's devices through the encrypted vault sync, with the same zero-knowledge guarantees as passwords.",
    d: "A passkey is an item, so it uses the normal item sync: encrypted with the vault key, uploaded, and decrypted on other devices. No special channel is needed. Passkeys created on a device-bound hardware authenticator cannot move. When the person changes platforms, a sync-capable manager is the way to carry credentials. The challenge is the trust shift: sites that distinguish device-bound from syncable passkeys may treat the credential as lower assurance, and a bug in item sync now has a login consequence.",
    k: ["Syncing keys through the vault vs requiring registration per device: sync gives continuity, but each site must accept a credential that is no longer tied to one piece of hardware.", "Including passkeys in shared collections vs personal only: sharing lets a team use one account, but defeats the individual accountability passkeys usually imply."],
    p: ["A sync conflict overwrites a passkey with an older one, and the site stops accepting the credential.", "A site marks syncable passkeys as backup-eligible and a policy denies them for high-risk operations."],
    v: "Create a passkey on device one, wait for sync, sign in from device two with the device one vault locked, and confirm success. Revoke device one and confirm the key remains valid on two.",
    dep: ["passkey-storage", "sync-protocol", "conflict-resolution"]
  },
  "credential-exchange-format": {
    s: "A standard, encrypted way to move credentials, including passkeys, from one manager to another without a plain-text file on disk.",
    d: "Rather than exporting a spreadsheet, the source manager packages items in a structured format and hands them over a protected channel to the destination, which imports them. The format carries passwords, one-time code seeds, passkeys and attachments with their relations. Both sides authenticate the person, and the transfer may use the platform's secure transfer interface or an encrypted file with a one-time key. The difficulty is agreement: every manager has its own model, and fields without a defined mapping are dropped.",
    k: ["Standard structured exchange vs vendor file formats: a standard avoids lock-in and plain-text files, but needs both sides to implement it and handle unknown fields.", "Direct secure transfer vs encrypted file: direct transfer leaves nothing on disk, but requires both managers online on the same device or network."],
    p: ["The destination imports passkeys without flagging that the source still holds them, leaving two live copies.", "A transfer file is not deleted after import and holds all secrets under a weak key."],
    v: "Move a vault with logins, one-time seeds and a passkey from one manager to another using the format, then confirm each item works against a test site and that no plaintext file was written to disk.",
    dep: ["item-schema", "import-export", "passkey-storage"]
  },
  "totp-generator": {
    s: "Computes six-digit time-based one-time codes from a seed stored in the vault item, so the second factor lives next to the password.",
    d: "The seed is a shared secret established when the person enabled two-step login on a site, usually by scanning a code. The client computes a keyed hash of the current thirty-second counter and truncates it to digits, as the standard defines. Codes display with a countdown and can be filled automatically. A seed carries the same sensitivity as a password and is stored in the item. The challenge is time: a wrong device clock yields invalid codes, and keeping both factors in one place weakens the separation that two-step login was meant to give.",
    k: ["Seed in the same vault as the password vs a separate authenticator: convenient and synced, but one vault compromise defeats both factors.", "Auto-copy and fill code on login vs manual: automatic is faster and defeats typing mistakes, but code is also sent to any page that gets matched."],
    p: ["A device with a wrong clock produces codes that fail, and the person suspects the site.", "Seeds are shown in a QR code during setup that is saved in screenshots or cloud photo backups."],
    v: "Compare the generated code against a reference implementation for fixed seeds and times, then log in to a test site with it. Change the device clock by two minutes and confirm the mismatch is detected and reported.",
    dep: ["item-schema", "authenticated-encryption"]
  },
  "hardware-key-second-factor": {
    s: "Supports physical security keys as a second factor for the manager's own account login, so a stolen master password alone cannot open an account.",
    d: "During enrollment the account registers one or more keys through the standard authentication interface; at login, the server issues a challenge and the key signs it after a touch. The server verifies the signature against the stored public key. Because this is account login, not vault decryption, the vault stays protected by the master password. Support for several keys and recovery codes is needed so a lost key does not lock the person out. It is hard because browsers, platforms and key types behave differently and the fallback path is the easiest to attack.",
    k: ["Hardware key as required second factor vs optional: required resists phishing even after password theft, but a lost key without a backup makes recovery hard.", "Offering weaker fallbacks such as codes by message: fallbacks reduce lockouts, but an attacker simply picks the weakest method offered."],
    p: ["Only one key is enrolled, it is lost, and the fallback code was never saved.", "A fallback to a message-based code lets an attacker bypass the key by social engineering the carrier."],
    v: "Enroll two keys, log in with each, then remove one and confirm it no longer works. Attempt login with the password alone on a new device and confirm access is denied without the touch.",
    dep: ["two-step-login", "webauthn-ceremony", "recovery-codes"]
  },
});
