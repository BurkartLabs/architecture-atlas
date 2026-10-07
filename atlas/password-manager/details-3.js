// Details for the password manager plate, part 3: sharing, authentication and unlock, recovery.
ATLAS.details("password-manager", {
  "organization-keys": {
    s: "A symmetric key owned by an organization that encrypts shared items, wrapped separately to each member's public key so the server never holds a usable copy.",
    d: "When an organization is created, the client generates a random key and a key pair for it. Shared items are encrypted under the organization key or under collection keys derived from it. For each member, the organization key is encrypted with that member's public key and stored beside the membership. A member decrypts it with their private key. Because members can read shared items directly, the design needs trust in the key given and a path to rotate it when someone leaves. The challenge is correctness: a wrong public key at wrapping time gives access to the wrong party.",
    k: ["One organization key vs a key per collection: one key is simple and fast to rotate for everyone, while per-collection keys limit what one revoked or leaked key exposes.", "Wrapping to the member's public key vs a shared password: public-key wrapping lets the server hold wrapped keys safely, but needs a trustworthy way to learn the member's real key."],
    p: ["The server substitutes its own public key during invitation and quietly receives the wrapped organization key.", "A key wrapped under an old public key stays unreadable after the member rotates their key pair."],
    v: "Add a member, confirm the server stores only a ciphertext of the organization key, and that the member decrypts a shared item. Compare the public key used to wrap against the member's displayed fingerprint.",
    dep: ["account-key-pair", "key-hierarchy", "member-invitation"]
  },
  "collections-permissions": {
    s: "Groups of shared items with per-member or per-group rights, such as read, edit, hide passwords and manage, enforced by the clients and by the server's access rules.",
    d: "A collection is a named set of shared items. Members and groups receive a permission on each collection. The server enforces which ciphertext a person may download, but cannot enforce what a client does with a decrypted secret, so a read-only or hide-password right is partly advisory: any member who can decrypt an item can copy what they can see. Hidden-password mode keeps values out of the interface, but the client still held the key. The difficulty is the gap between server-enforced and cryptographically enforced controls.",
    k: ["Server-enforced access with one shared key vs a key per collection: per-collection keys make access cryptographic, while a single key relies on the server to withhold ciphertext.", "A hide-password permission vs a true view-only right: hiding supports autofill without display, but cannot stop an extension's fill from leaking the value to a page."],
    p: ["A member given only fill rights extracts the password with the developer tools of the browser.", "A collection permission change does not remove already downloaded ciphertext and key from a device."],
    v: "Give a member hide-password rights on one collection, confirm autofill works but the UI never shows the value, and confirm the server returns no items from other collections to that member.",
    dep: ["organization-keys", "role-management", "api-gateway"]
  },
  "member-invitation": {
    s: "The steps that add a person to an organization: an invitation, acceptance, and a confirmation by an administrator that checks the new member's public key before sharing keys.",
    d: "An invitation names an address and a role. The invitee accepts using their account, which publishes their public key. Before the organization key is wrapped for them, an administrator confirms the member, ideally by comparing a fingerprint of the key through another channel. Only then is the organization key encrypted to that member. Until confirmation, the member holds no access to shared items. The challenge is human: confirmation steps are skipped as busywork, though they are what prevents a server from slipping in a substitute key.",
    k: ["Administrator confirmation vs automatic key release: confirmation blocks a server-injected key, but delays access and demands an active administrator.", "Fingerprint comparison out of band vs trust on first use: comparing is strong, but few people do it; trust on first use is smooth and open to a one-time substitution."],
    p: ["An invitation link sent over email is forwarded and accepted by the wrong person.", "Administrators bulk-confirm members without checking, which removes the only defense against key substitution."],
    v: "Invite a test member, accept, and confirm they cannot read shared items until confirmed. Compare the fingerprint shown to the admin against the member's own display, and confirm they match.",
    dep: ["account-key-pair", "organization-keys", "mail-service"]
  },
  "role-management": {
    s: "Defines what each organization member may administer: owners, administrators, managers and plain users, with groups to apply collection rights to many people at once.",
    d: "Roles cover management actions such as inviting, removing, editing policies and viewing reports, and are separate from access to secrets. Groups bundle members, so a collection can be granted to a group and membership changes adjust access. The server enforces roles on its API. Custom roles refine the built-in set. The difficulty is the privilege graph: administrators who manage membership can also add themselves to groups, and without separation of duties one compromised administrator reaches everything.",
    k: ["Few built-in roles vs fully custom roles: few roles are easy to audit, while custom roles fit least-privilege goals but are harder to reason about and review.", "Group-based grants vs per-user grants: groups scale and follow joiners and leavers, but make it harder to see who holds access to one item."],
    p: ["A manager can assign themselves to a group that holds a sensitive collection and escalate silently.", "Group membership lags behind directory changes, so a departed employee keeps access for days."],
    v: "Create a manager, attempt to add themselves to an administrator group, and confirm it is refused or logged. Remove a user from a group and confirm access to the group's collections ends on their next sync.",
    dep: ["collections-permissions", "audit-event-log", "directory-sync"]
  },
  "link-sharing": {
    s: "Creates a short-lived link that gives a recipient a single secret without requiring an account, with the decryption key carried in the link fragment so the server never sees it.",
    d: "The sender's client encrypts the text or file with a fresh key and uploads the ciphertext with an expiry and a view limit. The link contains an identifier for the server and the key in the part after the hash sign, which browsers do not send to servers. The recipient's page fetches the ciphertext and decrypts it locally. After the limit or time, the server deletes it. The challenge is that the link is itself the secret: anyone who sees it, including chat tools that preview links, can read the content.",
    k: ["Key in the fragment vs a separate password: the fragment needs no extra step and stays off the server, but anything that records the full link, such as chat history, holds the secret.", "Limited views and expiry vs permanent links: limits shrink the exposure window, but a link preview bot can consume the only view."],
    p: ["A messaging app fetches the link to build a preview and uses up the single view before the recipient opens it.", "Browser history and proxy logs store the full URL including the fragment."],
    v: "Create a one-view link, capture the traffic and confirm the key never reaches the server. Open it once, then again, and confirm the second attempt fails and the ciphertext is deleted.",
    dep: ["authenticated-encryption", "ciphertext-store", "web-vault"]
  },
  "directory-sync": {
    s: "Keeps organization membership and groups in step with a company directory through a provisioning protocol, creating and disabling accounts as people join and leave.",
    d: "A connector reads users and groups from the directory, or receives events through a standard provisioning interface, and calls the organization's API to invite, update or remove members. Removal revokes server-side access and queues rekeying. Because the connector cannot read vault contents, it cannot confirm a new member's key either, so confirmation can lag. Mapping directory groups to collections is the main configuration. The challenge is lifecycle correctness: lagging syncs, renamed groups and reused addresses can grant access to the wrong person.",
    k: ["Automatic confirmation by a trusted connector vs manual: automatic gives instant access, but turns the connector into a party able to inject keys.", "Directory as the single source of membership vs local overrides: one source keeps offboarding reliable, but local exceptions for contractors then need a parallel process."],
    p: ["A directory address is reused for a new hire and inherits the previous employee's collections.", "A sync outage leaves removed employees active until the next successful run."],
    v: "Disable a user in the test directory and confirm their organization access is revoked within the stated interval and their next sync returns no shared ciphertext. Re-enable and confirm they return unconfirmed.",
    dep: ["role-management", "membership-revocation", "api-gateway"]
  },
  "org-policies": {
    s: "Rules an organization sets for its members, such as minimum master password strength, required two-step login, disabled export and vault timeout limits, applied by the clients.",
    d: "An administrator toggles policies stored with the organization. Clients fetch them at sync and enforce them locally: refusing a weak password, forcing a second factor, blocking exports or capping the time a vault may stay unlocked. The server enforces those that it can check, such as two-step requirement at login. Policies on master password complexity can only be checked by the client, since the server never sees the password. The challenge is that client-enforced policies are advisory against a modified client.",
    k: ["Client-enforced policy vs server-enforced: client policies can cover anything the client sees, but a modified client ignores them; server enforcement works only for what the server can observe.", "Strict policy on personal accounts that join vs organization scope only: strict policy reaches everything, but raises privacy objections when a person's own vault is affected."],
    p: ["A policy blocking export is bypassed by copying fields manually or by an unofficial client.", "A newly added timeout policy locks out a member mid-task without notice and creates support load."],
    v: "Enable a minimum master password strength policy and confirm a member with a weak password is prompted to change it at next login. Enable the export block and confirm the client refuses export.",
    dep: ["role-management", "strength-estimation", "unlock-and-timeouts"]
  },
  "membership-revocation": {
    s: "Removes a member's access and, where needed, rotates the organization key and re-encrypts shared items so that former members cannot read future changes.",
    d: "Removal first deletes the member's wrapped key and API access. That stops new downloads but cannot erase what the person already copied or decrypted. For real revocation, an administrator rotates the organization key: a new key is generated, every shared item is re-encrypted, and the new key is wrapped for the remaining members. Passwords the person saw must still be changed at the sites. The hard parts are cost, since large collections mean many re-encryptions, and honesty, since cryptography cannot revoke knowledge.",
    k: ["Rotate keys on removal vs only delete access: rotation protects later edits, but costs time and coordination; deleting access is instant and leaves former members able to read cached data.", "Lazy re-encryption at next edit vs immediate: lazy spreads the cost, but leaves old ciphertext readable under the old key for longer."],
    p: ["The organization key is rotated but the shared passwords themselves are not changed at the sites, so the former member still has valid credentials.", "Items in an offline member's cache stay under the old key until they sync, and conflicts appear."],
    v: "Remove a test member, rotate the key, then attempt to decrypt a newly edited shared item with the old key and confirm failure. Confirm remaining members sync and read all items under the new key.",
    dep: ["organization-keys", "key-hierarchy", "per-item-keys"]
  },
  "account-login": {
    s: "The sequence by which a client proves identity to the server and receives a session, based on a derived hash rather than the master password itself.",
    d: "The client asks the server for the account's derivation parameters, derives the master key from the password locally, then derives a separate authentication value and sends that. The server stores a further hash of it and compares. On success the server returns the encrypted account key and a session token, and the client decrypts the vault. A new device may need extra checks. The challenge is that exposing the parameters before authentication lets an attacker probe which accounts exist and which have weak settings.",
    k: ["Authenticate with a derived value vs the password: the server never receives anything that opens the vault, but must hold the authentication hash as a password-equivalent for the account.", "Return parameters to unknown addresses vs refusing: refusing leaks which accounts exist; returning fake parameters hides existence at the cost of more server logic."],
    p: ["The authentication hash is derived the same way as the encryption key, so a server compromise yields the vault key.", "Account existence leaks through different response times or different parameters for real and unknown addresses."],
    v: "Capture the login traffic and confirm the master password and the vault key never appear. Request parameters for a nonexistent address and confirm the response is indistinguishable in content and timing from a real account.",
    dep: ["auth-hash", "master-key-derivation", "session-tokens", "key-separation"]
  },
  "auth-hash": {
    s: "The value a client sends to prove it knows the master password, derived separately from the encryption key and hashed again on the server before storage.",
    d: "After deriving the master key, the client runs one more derivation with a different label to produce the authentication value. The server treats this as a password: it applies its own salted, slow hash and stores the result. A database leak then yields only a second-level hash that is costly to attack and unrelated to the key that decrypts vaults. The design depends on the two derivations being independent, so knowing one gives nothing about the other. The challenge is auditing that separation across all clients.",
    k: ["Separate derivations for auth and encryption vs one value: separation limits a server compromise to a login credential, but each client must implement the key separation correctly.", "A second server-side hash vs storing the value directly: the second hash slows attacks on a stolen database, but adds server CPU per login that attackers can abuse for denial of service."],
    p: ["A client library reuses the encryption key as the authentication value and a server breach exposes vaults.", "The server stores the received value in plain form in logs during debugging."],
    v: "Inspect the server's stored credential for an account and confirm it is a salted slow hash of the received value, and confirm that value cannot decrypt the account key. Verify independently with test vectors.",
    dep: ["key-separation", "master-key-derivation", "account-database"]
  },
  "two-step-login": {
    s: "A second proof at account login, such as a one-time code, hardware key or approval prompt, checked by the server before it releases the encrypted vault.",
    d: "After the authentication value passes, the server requires an additional factor chosen at enrollment. It validates the code or signature and only then issues a session and the encrypted keys. Because the factor guards server access and not decryption, a stolen vault copy is still protected only by the master password. Remembered-device tokens skip the prompt on trusted machines for a period. The challenge is recovery and downgrade: methods must be offered in a safe order, and every backup method is a path an attacker may choose.",
    k: ["Factor protects server access only vs also contributes to vault keys: server-only is simple and recoverable, but a stolen ciphertext copy is guarded by the password alone.", "Remember this device for a month vs prompt every time: remembering reduces fatigue, but a stolen token on a compromised device bypasses the factor."],
    p: ["Remembered-device tokens never expire and survive password changes.", "Offering message-based codes as an alternative lets an attacker downgrade a hardware-protected account."],
    v: "Enable a second factor, log in from a new device with the password alone and confirm the session is refused. Change the password and confirm remembered-device tokens are invalidated.",
    dep: ["account-login", "totp-generator", "hardware-key-second-factor", "recovery-codes"]
  },
  "session-tokens": {
    s: "Short-lived access credentials issued after login, paired with refresh tokens, that let a client call the API without resending the authentication value.",
    d: "On success the server issues an access token valid for minutes to hours and a refresh token bound to the device. The client attaches the access token to each request. Expired tokens are renewed through the refresh token, which can be revoked from the device list. Tokens identify and authorize but cannot decrypt anything. Sign-out and password change invalidate them. The challenge is storage: tokens on a device are bearer secrets, so they must live in protected storage, and theft needs both rotation on use and revocation on suspected reuse.",
    k: ["Short access tokens with refresh rotation vs long-lived tokens: rotation limits a stolen token's value and detects reuse, but adds refresh traffic and failure handling.", "Binding tokens to a device key vs bearer only: binding prevents replay from another machine, but needs hardware-backed keys that some devices lack."],
    p: ["A refresh token is stored in plain local storage and a malicious extension copies it.", "Password change leaves old sessions valid, so an intruder keeps access after the person thinks they have secured the account."],
    v: "Log in on two devices, change the password on one and confirm the other's refresh fails and demands login. Replay a used refresh token and confirm the whole token family is revoked.",
    dep: ["account-login", "secure-os-storage", "device-registry"]
  },
  "unlock-and-timeouts": {
    s: "The lock state of the vault on a device: when keys are discarded from memory, what is needed to unlock again, and the idle, sleep and restart rules that trigger locking.",
    d: "Lock wipes decrypted keys and item data from memory while the encrypted cache stays. Unlock needs the master password, a PIN or a biometric. Timers lock after idle time, on system sleep, on screen lock or on browser close, depending on policy. A lock can also be a log-out, which removes the cache and token. The difficulty is choosing defaults: aggressive locking annoys, so people disable it or pick weak PINs, and a lock that fails to clear memory is only cosmetic.",
    k: ["Lock vs log out on timeout: lock keeps the cache for a fast unlock but leaves ciphertext on disk, while log out wipes it and costs a full login to return.", "Lock on system sleep vs on a timer only: sleep locking closes the lid-open window, but is annoying on short meeting breaks."],
    p: ["A lock hides the interface while decrypted keys remain in memory, so a memory dump still yields the vault.", "People disable the timeout because it interrupts them, leaving the vault open for days."],
    v: "Lock the vault, dump the process memory and confirm no vault key or decrypted item text is present. Close the laptop lid and confirm the vault is locked on resume under the sleep policy.",
    dep: ["memory-hygiene", "biometric-unlock", "pin-unlock", "local-vault-cache"]
  },
  "biometric-unlock": {
    s: "Opens the vault with a fingerprint or face check by releasing a stored unlock key from hardware-backed storage, instead of asking for the master password.",
    d: "At enrollment the client stores a key derived from the vault key in the platform keystore, protected by a requirement for biometric authentication. At unlock the keystore releases it after the person passes the check, and the client decrypts the vault key. The master password is still needed after restarts, policy timeouts or enrollment changes. The biometric template never reaches the application. The challenge is what it adds: it is a convenience over the master password, not a replacement, and weak sensors or a fallback to device passcode set the real strength.",
    k: ["Keystore key invalidated by enrollment change vs surviving it: invalidation blocks an attacker who adds their own fingerprint, but forces the password after legitimate changes.", "Biometric as a convenience factor vs a replacement for the password: keeping the password as the root means a sensor flaw cannot expose the vault alone, at the cost of periodic password entry."],
    p: ["A device passcode fallback is shorter than the master password and becomes the real weakest link.", "An attacker with device access enrolls their face and unlocks because the key was not tied to enrollment."],
    v: "Enable biometric unlock, add a second fingerprint to the device and confirm the next unlock demands the master password. Confirm that after a reboot the master password is required once.",
    dep: ["secure-os-storage", "key-hierarchy", "unlock-and-timeouts"]
  },
  "pin-unlock": {
    s: "A short code that re-opens a recently used vault on a device, with a limited number of attempts before it is disabled and the master password is required.",
    d: "The PIN encrypts a copy of the unlock key held in protected local storage. Because a PIN has little entropy, the design depends on limiting guesses: after a few wrong attempts the stored copy is deleted, so an attacker with a disk copy still cannot try offline unless the copy is exposed. Where hardware can enforce the attempt counter, it is used. The difficulty is that software counters can be reset by restoring files, so a PIN is only as strong as the place the counter and wrapped key live.",
    k: ["Hardware-enforced attempt limit vs software counter: hardware resists restoring a backup to reset attempts, but not every device offers it.", "Longer alphanumeric PIN vs short numeric: longer resists offline guessing if the counter is bypassed, but defeats the purpose of fast unlock."],
    p: ["A backup restore resets the failed-attempt counter and allows unlimited PIN guesses.", "The PIN is also reused as the device passcode, so shoulder-surfing one exposes both."],
    v: "Enter a wrong PIN until the limit is reached and confirm the wrapped key is deleted and the master password is demanded. Restore an earlier copy of the data folder and confirm the counter cannot be reset.",
    dep: ["unlock-and-timeouts", "secure-os-storage", "key-hierarchy"]
  },
  "device-approval": {
    s: "Lets a person log in on a new device by approving the request from an already trusted device, which hands over the key needed to decrypt the vault.",
    d: "The new device generates a temporary key pair and asks the server for approval, showing a fingerprint phrase. A trusted device displays the request and, once the person confirms the matching phrase, encrypts the user key to the new device's public key and uploads it. The new device decrypts it and unlocks without the master password. It is the basis for passwordless unlock. The challenge is the human check: if people approve prompts without comparing phrases, a prompt-bombing attacker obtains vault access.",
    k: ["Approval from a trusted device vs master password only: it allows passwordless setups and recovers from a forgotten password, but depends on having a working trusted device.", "Phrase comparison required vs a simple approve button: comparing blocks approval of an attacker's request, but people skip it unless the interface forces it."],
    p: ["A flood of approval prompts leads a tired person to approve an attacker's device.", "The only trusted device is lost and no other approval path was configured."],
    v: "Request login from a new device and confirm the trusted device shows a matching phrase and, after approval, the new device decrypts the vault without the master password. Deny and confirm no key is released.",
    dep: ["account-key-pair", "device-registry", "key-hierarchy"]
  },
  "sso-unlock": {
    s: "Combines a company's single sign-on with vault decryption, so members authenticate through the identity provider while the vault key is still protected by something the provider never sees.",
    d: "The identity provider proves who the person is through a standard federation protocol, but it cannot supply the vault key. Decryption instead uses a device key approved by an administrator, a trusted-device approval, or a key held by an organization-level escrow. The server maps the federated identity to a vault account. The challenge is that SSO removes the master password, the one secret the provider never had, so an alternative must keep the zero-knowledge property, and each alternative moves trust.",
    k: ["Trusted-device decryption vs administrator key escrow: device keys keep the organization out of the vault, while escrow lets administrators recover members, at the price of holding a decryption path.", "Master password retained for SSO users vs removed: keeping it preserves a root secret, but undermines the point of single sign-on for many companies."],
    p: ["The identity provider is compromised and an attacker authenticates as any member, then asks for device approval.", "SSO accounts without any trusted device have no way to decrypt after a new laptop."],
    v: "Log in as an SSO member on a new device and confirm the identity provider confirms identity but the vault opens only after device approval or the configured escrow path, and that the provider never receives a key.",
    dep: ["device-approval", "admin-recovery", "account-login"]
  },
  "master-password-change": {
    s: "Replaces the master password by re-deriving the master key and re-wrapping the account key, without re-encrypting every vault item.",
    d: "The client verifies the old password, derives a new master key with fresh parameters and a new salt, and encrypts the account key under it. It also computes the new authentication value and sends both. Items stay encrypted under the account key, so a vault of thousands of items updates in one small write. Other sessions are revoked. The difficulty is what it does not change: if the account key was exposed before, a password change leaves it unchanged, so a full key rotation is needed after a suspected compromise.",
    k: ["Rewrap the account key vs re-encrypt all items: rewrapping is instant and atomic, but cannot revoke a key an attacker already copied.", "Offer full key rotation as an option vs always rotate: always rotating is safest, but re-encrypting a large vault and shared items is slow and risky."],
    p: ["A password change that does not rotate the account key leaves a leaked key usable after the change.", "The change is interrupted between uploading the new wrapped key and the new authentication value, locking out the person."],
    v: "Change the password, then confirm the old password fails, the new one works, and only the wrapped key and authentication value changed on the server. Kill the process mid-change and confirm login still works with one password.",
    dep: ["key-hierarchy", "master-key-derivation", "auth-hash", "session-tokens"]
  },
  "recovery-kit": {
    s: "A printable or storable document holding the secrets needed to regain access, such as a recovery key, kept offline by the person.",
    d: "At account creation the client generates a high-entropy recovery key, shows it once as a code or QR, and uses it to wrap a copy of the account key. The person saves it somewhere safe. If the master password is forgotten, the recovery key unwraps the account key and a new master password is set. The server holds only the wrapped copy. The challenge is behavioral: most people do not save the kit, and a saved kit is a second path to the vault whose protection is exactly that of the paper or file.",
    k: ["Recovery key held by the person vs escrow with the provider: the person's key keeps zero knowledge but fails when it is lost; escrow recovers anyone but gives the provider a decryption path.", "Requiring the kit at sign-up vs optional: requiring improves recovery rates, but adds sign-up friction and a stored secret many people store badly."],
    p: ["The kit is photographed into a cloud photo library together with the account email.", "People believe the provider can reset the password, never save the kit and lose the vault."],
    v: "Create an account, set aside the recovery key, change the master password to something forgotten and use only the key to regain access and set a new password, confirming all items decrypt.",
    dep: ["key-hierarchy", "random-generation", "master-password-change"]
  },
  "recovery-codes": {
    s: "One-time codes shown when two-step login is set up, which let the person log in if they lose their second factor, each usable once.",
    d: "The server generates a set of random codes, shows them once and stores only hashes. A code skips the second factor at login and is then invalidated. Using one often disables the factor so the person re-enrolls. The codes do not decrypt the vault; the master password is still required. They matter because losing a phone otherwise means losing the account. The challenge is that a code is a bypass of the second factor, so attackers target how it is stored, and a person who never saves them finds the account stuck.",
    k: ["Recovery codes vs support-assisted reset: codes are self-service and resist social engineering, but fail when unsaved; support resets help people, and are a route for fraud.", "Hashed storage with a single use vs reusable: single-use limits what a leaked code allows, but a person must regenerate a set regularly."],
    p: ["Codes saved in the same vault they are meant to recover are unavailable when needed.", "Support agents can be talked into disabling the second factor, bypassing the codes entirely."],
    v: "Generate codes, use one to log in without the second factor and confirm it works once and then fails, and that the server holds only hashes of the remaining codes.",
    dep: ["two-step-login", "account-database", "random-generation"]
  },
  "emergency-access": {
    s: "Lets a trusted person request access to the vault after a waiting period, so family or colleagues can reach critical accounts if the owner is incapacitated.",
    d: "The owner designates a contact, who receives an encrypted copy of the owner's account key wrapped to their public key. The contact starts a request, and the owner is notified and may deny it. If the owner does not respond within the chosen wait, access is granted at view or takeover level. Takeover can reset the owner's master password. The server holds only wrapped keys and timers. The challenge is trust: the contact holds a latent key from day one, so a compromised contact account plus a silent owner is a full compromise.",
    k: ["Wrapped key given at setup vs released at grant time: setup-time wrapping works even if the owner is gone, but the contact's key already can decrypt once the server releases it.", "Waiting period of days vs hours: long periods give the owner time to refuse, but delay access in a real emergency."],
    p: ["The owner stops reading notification email, so a request from an attacker who controls the contact is granted unnoticed.", "A contact deletes their account and the wrapped key becomes unusable at the moment it is needed."],
    v: "Designate a test contact, start a request, confirm the owner is notified, deny it and confirm no access. Repeat with no response, and confirm access opens only after the configured wait.",
    dep: ["account-key-pair", "key-hierarchy", "mail-service"]
  },
  "admin-recovery": {
    s: "An organization feature that lets an administrator reset a member's master password by holding an escrowed key, restoring access to the member's vault at the cost of a decryption path.",
    d: "When enabled by policy, each enrolled member wraps their account key to an organization recovery key at enrollment. If the member forgets their password, an administrator uses the escrowed key to rewrap the account key under a new password the member chooses. The server holds only wrapped keys. The enrollment is visible to the member and recorded in the audit log. The challenge is that it is deliberately a back door: it makes lost passwords survivable and makes an administrator compromise catastrophic.",
    k: ["Escrow recovery vs none: escrow gives business continuity when people forget passwords, but any holder of the organization recovery key can read enrolled vaults.", "Optional enrollment vs mandatory: opt-in respects privacy preferences, but leaves some people without recovery and complicates support."],
    p: ["The recovery key is held by a single administrator and lost with them, making all escrow useless.", "A reset is done without verifying the requester's identity and an attacker takes over a member's vault."],
    v: "Enroll a test member, reset their password as an administrator and confirm the member can open the vault with the new password and that the reset appears in the audit log with the administrator's identity.",
    dep: ["organization-keys", "key-hierarchy", "audit-event-log"]
  },
});
