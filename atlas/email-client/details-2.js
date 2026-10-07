// Details for the email client plate, part 2: safe rendering, attachments, encryption and authenticity.
ATLAS.details("email-client", {
  "mime-parser": {
    s: "Turns raw message bytes into a tree of headers and typed parts, tolerating the malformed, truncated and deeply nested messages that real mail contains.",
    d: "The parser splits headers from body, unfolds long header lines, and walks multipart boundaries recursively, decoding each part's transfer encoding. It extracts structured fields such as addresses, dates and content types. Real mail breaks every rule: missing boundaries, duplicate headers, wrong lengths, invalid dates. The parser must recover rather than fail, yet remain consistent with other software so a message means the same thing to every reader. Limits on depth and size are required because parsers are a main attack surface.",
    k: ["Lenient recovery vs strict rejection: leniency shows damaged mail that people need, strictness is safer and simpler but hides messages.", "Parsing the whole message up front vs streaming by part: streaming bounds memory on huge messages, whole-message parsing is easier to implement and reason about."],
    p: ["Disagreement between this parser and a security filter about where a part ends lets a payload slip through unchecked.", "No depth or part-count limit lets a crafted nested message exhaust memory."],
    v: "Feed a corpus of malformed messages (missing boundaries, 10,000 nested parts, invalid UTF-8 in headers) and confirm the parser returns bounded results, never crashes, and shows the readable parts.",
    dep: ["charset-decoder", "protocol-parser"]
  },
  "charset-decoder": {
    s: "Converts header and body bytes in their declared or guessed character sets, and their transfer encodings, into correct Unicode text.",
    d: "Parts declare a charset and an encoding such as base64 or quoted-printable; headers use encoded-word syntax. The decoder applies these, falls back to detection when the declaration is missing or wrong, and replaces invalid sequences instead of failing. Legacy charsets, mixed encodings inside one header and bidirectional text all appear. It is hard because declarations lie, because detection is a guess, and because the wrong choice silently yields mojibake or lets crafted bytes be read differently by a filter and by the display.",
    k: ["Trust the declared charset vs detect: declared is predictable and standards-based, detection rescues mislabeled mail but sometimes guesses wrong.", "Replace bad bytes vs reject the message: replacement keeps mail readable, rejection is stricter but hides content."],
    p: ["A mislabeled charset turns an entire non-English message into unreadable symbols.", "Decoding differences between the scanner and the renderer let encoded text hide content from a filter."],
    v: "Open messages in several legacy and wide character sets, with correct, missing and wrong declarations, and confirm text displays correctly in the first two cases and degrades gracefully with a visible override in the last.",
    dep: []
  },
  "html-sanitizer": {
    s: "Rewrites a message's HTML into a safe subset by removing scripts, active content, dangerous attributes and risky styles before anything is displayed.",
    d: "The sanitizer parses HTML the way a browser does, then walks the tree keeping only an allowlist of elements, attributes and URL schemes, and a restricted set of style properties. It removes scripts, event handlers, forms, embedded objects and frames, and rewrites links and remote resource references so other components can control them. It must parse exactly as the display engine does, because differences in how malformed markup is interpreted are the usual bypass. It is a security boundary, so it runs again on any content derived from the message.",
    k: ["Allowlist vs blocklist: an allowlist drops new or unknown features by default and breaks fancy layouts, a blocklist keeps layouts but misses new attack forms.", "Sanitizing at display vs at storage: at display always uses the current rules, at storage is faster but old stored results keep old bugs."],
    p: ["Parser mismatch between the sanitizer and the engine lets nested or malformed markup reconstitute a script after cleaning.", "Allowing broad style properties permits positioning tricks that overlay fake login forms on the message."],
    v: "Run a public corpus of cross-site scripting payloads through the pipeline and confirm no script executes and no network request is made in the sandbox, while normal newsletters still lay out acceptably.",
    dep: ["mime-parser", "charset-decoder"]
  },
  "sandboxed-renderer": {
    s: "Displays sanitized message content in an isolated surface with no script execution, no access to application data and no direct network access.",
    d: "The renderer is a separate process or embedded view with scripting off, a content policy that blocks every network load except those the client explicitly allows, and no way to call back into the app beyond narrow, validated messages such as link clicks. Resources are supplied by the client, not fetched by the view. It also controls size, zoom and dark-mode adaptation. It is hard because mail layouts assume old HTML engines, because isolation must hold even if the sanitizer fails, and because each message needs its own instance or a clean reset.",
    k: ["Out-of-process view vs in-process view: out-of-process contains a rendering exploit but costs memory and startup time per message.", "Force dark mode by rewriting colors vs show as authored: rewriting reads well at night but can make some mail unreadable, authored colors preserve the sender's design."],
    p: ["Reusing one view across messages lets one message's styles or state affect the next.", "Giving the view network access 'just for images' re-enables tracking and request forgery."],
    v: "Open a message with embedded script, a form and an iframe and confirm none run or load; inspect the view's network log during display and confirm zero requests unless the user chose to load remote content.",
    dep: ["html-sanitizer", "remote-content-blocker", "link-policy"]
  },
  "remote-content-blocker": {
    s: "Blocks images, stylesheets and fonts hosted on external servers by default, and loads them only on the user's choice or from a trusted sender, to prevent tracking.",
    d: "After sanitizing, every external URL is replaced by a placeholder and recorded. The reading pane tells the user content was blocked and offers to load it once or always for the sender or domain. When allowed, the client may fetch the resources itself through a proxy or with stripped identifying details and hand them to the renderer. It is hard because blocking breaks the layout of marketing mail, because CSS can fetch resources in many places, and because the allow decision must be remembered without becoming a tracking opt-in for everyone.",
    k: ["Load images by default vs block by default: loading looks better and is what most clients once did, blocking stops read receipts and IP exposure.", "Fetch through a proxy vs directly from the device: a proxy hides the user's address and device but sees what is fetched and can cache it, direct is simple and leaks."],
    p: ["Missing a resource reference in CSS background or font rules lets a tracker load despite the block.", "Always-allow for a whole domain trusts every sender using shared hosting."],
    v: "Open a message with ten remote images from a test server and confirm the server sees zero requests until the user chooses to load; then confirm exactly ten requests with no cookies.",
    dep: ["html-sanitizer", "tracking-defense", "network-awareness"]
  },
  "tracking-defense": {
    s: "Detects and neutralizes methods that report when and where a message was opened, such as one-pixel images, unique link parameters and fetched fonts.",
    d: "Heuristics and lists identify tracking hosts and patterns such as tiny images, long per-recipient URLs and redirects. Defenses include blocking, fetching through intermediaries that return one copy to many senders, removing known tracking parameters from links, and disabling read receipts by default. A report to the user shows what was blocked. It is hard because trackers and legitimate content share infrastructure, because prefetching by the client itself can fire trackers before the user reads, and because rewriting links can break signed or single-use URLs.",
    k: ["Strip parameters from links vs leave links untouched: stripping reduces tracking but can break login or unsubscribe links, leaving them intact keeps function and leaks.", "Prefetch images on the server side vs on the client: server-side fetch hides the reader but fires at delivery, making the open signal meaningless and the load heavy."],
    p: ["Prefetching all remote images at sync time reports every message as opened, including spam.", "Aggressive parameter stripping breaks one-click unsubscribe, so users keep receiving unwanted mail."],
    v: "Send a message with a unique tracking image and a unique link parameter from a test sender, read it, and confirm no open is logged and the clicked link carries no per-recipient identifier.",
    dep: ["remote-content-blocker", "link-policy"]
  },
  "link-policy": {
    s: "Shows where links really go and applies rules before opening: mismatched text and target, lookalike domains, dangerous schemes and unsafe redirects.",
    d: "Anchor targets are extracted at sanitize time. The reading pane shows the real destination on hover or long press and warns when the visible text looks like a different address. Schemes outside a short allowlist are refused. Opening goes to the system browser, not the renderer. Domain comparison handles internationalized names that look like Latin ones. It is hard because legitimate mail uses tracking redirect domains that look suspicious, and because a warning shown for all of them is ignored.",
    k: ["Always show the real destination vs only for suspicious links: always is transparent and noisy, selective is quieter but depends on detection that attackers test against.", "Check links against a reputation service vs locally only: a service knows fresh phishing sites but learns which links the user clicks."],
    p: ["A link whose text shows one domain and target another goes unnoticed on small screens with no hover.", "Visual lookalike domains using other scripts pass a naive string comparison."],
    v: "Open a message with a link whose text reads one domain and target another, and confirm a mismatch warning with the true host appears before the browser opens; open a script-scheme link and confirm it is refused.",
    dep: ["html-sanitizer", "phishing-indicators"]
  },
  "plain-text-converter": {
    s: "Converts HTML to readable plain text and plain text to safe HTML, for snippets, text-only views, the text alternative of outgoing mail and search indexing.",
    d: "HTML to text keeps structure that matters: paragraphs, lists, line breaks, link targets and quoted text, and drops styling and hidden elements. Text to HTML escapes content, converts line breaks, and recognizes links and quoted lines. The same routines produce list snippets and search text. It is hard because hidden text and zero-size elements carry spam content invisible to a reader but visible to a naive converter, and because reflowing format=flowed text correctly preserves quoted structure.",
    k: ["Convert on demand vs store the result: on demand saves space and uses current rules, storing speeds lists and search but keeps stale conversions.", "Include hidden elements vs drop them: dropping matches what the reader sees, including them aids spam detection but misleads snippets."],
    p: ["Snippets built from hidden preheader text show the sender's filler instead of the real first line.", "Collapsed whitespace destroys the layout of intentionally formatted plain-text tables and code."],
    v: "Convert a styled newsletter and confirm the text keeps headings, lists and link targets, drops hidden content, and the list snippet matches the first visible sentence.",
    dep: ["html-sanitizer"]
  },
  "phishing-indicators": {
    s: "Displays warnings for messages that show signs of impersonation or credential theft, based on sender checks, display-name tricks, link mismatches and known-bad lists.",
    d: "Signals include failed or missing sender authentication, a display name matching a contact while the address differs, a first-time sender, reply-to differing from from, and links to newly seen or lookalike domains. They combine into a banner with a short reason rather than a score. Lists of known malicious hosts may update periodically. It is hard because no single signal is reliable, because over-warning trains users to ignore it, and because attackers test messages against the same signals.",
    k: ["Explain the specific reason vs a generic danger banner: specific reasons let users judge and learn, but reveal the detection to attackers.", "Warn on display-name impersonation of known contacts vs only on authentication failure: the first catches the most common attack, at the cost of warning on legitimate mail from a person's new address."],
    p: ["A banner shown on a high share of legitimate mail is dismissed by habit, including when it matters.", "Relying only on sender authentication passes a lookalike domain that authenticates perfectly."],
    v: "Send test messages that impersonate a contact's name from another address and from a lookalike domain, and confirm each shows a banner naming its reason, while a normal message from the real contact shows none.",
    dep: ["sender-authentication", "link-policy", "address-book"]
  },
  "attachment-extractor": {
    s: "Finds attachments in the parsed message, reports their names, types and sizes from metadata, and fetches their content only when requested.",
    d: "Parts marked as attachments or that carry a filename are listed with decoded names and declared content types. Sizes and the part's position come from the server's message structure so the client can show a list without downloading anything. Fetching retrieves just that part and decodes it. The extractor also normalizes unsafe names. It is hard because declared types lie, because names can contain path separators or misleading extensions, and because attachments in forwarded messages are nested several layers deep.",
    k: ["Trust the declared type vs sniff the content: declared is cheap and predictable, sniffing finds disguised files but is imperfect and expensive.", "List attachments from server structure vs after full download: structure shows them instantly and costs a roundtrip, downloading wastes data on files never opened."],
    p: ["A filename with path separators or a hidden extension writes outside the save folder or disguises an executable.", "Nested attachments inside forwarded messages are invisible in the list, so users miss them."],
    v: "Open a message with three attachments, one nested in a forwarded message, and confirm all three appear with names and sizes before any download, and that a name containing '../' is sanitized on save.",
    dep: ["mime-parser", "partial-fetch"]
  },
  "inline-image-resolver": {
    s: "Maps content-identifier references in message HTML to the embedded image parts so inline pictures display without any network fetch.",
    d: "HTML references embedded images by content identifier. The resolver finds the matching part by that identifier, decodes it, and supplies the bytes to the renderer under a local reference. Images are size-checked and decoded in a limited context. Messages that use the same identifiers across replies or contain hidden duplicates need care. It is hard because image decoders are a frequent exploit target, because partial downloads leave images missing, and because embedded images must show while remote ones stay blocked.",
    k: ["Decode images in a separate limited process vs in the main app: separate limits damage from a decoder flaw at some overhead.", "Fetch embedded parts with the body vs on demand: with the body avoids missing images, on demand saves data for messages with large pictures."],
    p: ["A crafted image exploiting a decoder in the main process compromises the whole client.", "Body fetched without its related parts shows blank placeholders for images that were actually embedded."],
    v: "Open an HTML message with an embedded image offline after sync and confirm it shows with no network use; corrupt the image data and confirm the message still displays with a broken-image marker.",
    dep: ["mime-parser", "attachment-extractor"]
  },
  "preview-generator": {
    s: "Produces thumbnails and quick-look previews of common file types, without launching the file's own application or running its active content.",
    d: "For images, documents and archives the generator asks a platform previewer or a built-in converter to produce a static image or text. It runs in a restricted context with time and memory limits and caches the result. Macros, embedded links and scripts are not executed. It is hard because previewers parse complex formats and are a common target, because large files can take long to render, and because the preview can disclose content a user expected to review before opening.",
    k: ["Platform previewers vs a built-in set: platform covers many formats with no work but depends on its bugs and updates, built-in is predictable but limited.", "Generate previews on arrival vs on demand: on arrival feels instant but spends battery and processes untrusted files for mail never read."],
    p: ["Generating previews for every incoming attachment runs complex parsers on files from strangers, widening the attack surface.", "A preview of an archive extracts it to disk and fills storage."],
    v: "Preview a document containing a macro and an external link and confirm no macro runs and no network request is made; preview a 500 MB file and confirm it times out cleanly.",
    dep: ["attachment-extractor", "attachment-scanner"]
  },
  "attachment-scanner": {
    s: "Checks attachments for malware and policy violations, locally or through a service, and marks or quarantines files before the user can open them.",
    d: "Files are checked by signatures, heuristics and file-type consistency (does the content match the extension), with archives opened to a limited depth and password-protected ones flagged. Scanning may be done by the platform, a local engine or the server before delivery. Results attach to the attachment record. It is hard because encrypted archives cannot be scanned, because scanning at the client costs battery, and because a clean verdict is only as current as the signature set.",
    k: ["Scan on the server before delivery vs on the device: server-side protects every client and sees all mail, device scanning sees the final file but adds cost and updates burden.", "Block risky types outright vs warn: blocking stops common vectors but also stops legitimate files, warning leaves the decision to users."],
    p: ["A password-protected archive passes unscanned because the password is in the message body.", "Treating 'no result yet' as clean lets a file be opened before its scan completes."],
    v: "Attach the standard antivirus test file inside a nested archive and confirm the attachment is flagged and cannot be opened without an explicit override; confirm a pending scan blocks opening.",
    dep: ["attachment-extractor", "open-save-policy"]
  },
  "large-file-links": {
    s: "Replaces oversized attachments with links to files stored on a sharing service, and recognizes such links in incoming mail.",
    d: "When an attachment exceeds the server's size limit the client offers to upload it to a storage service and insert a link with access settings. Incoming messages with such links show them as attachments, optionally fetching metadata. Link expiry and permissions are part of the experience. It is hard because the recipient needs access without friction while the sender wants control, because links can expire and silently break old messages, and because an untrusted link in a message is exactly what phishing uses.",
    k: ["Upload to a provider's storage vs send directly with a raised limit: uploads work around mail limits but make the file's lifetime dependent on another service.", "Public-by-link access vs named-recipient access: link access is easy for recipients and risky if forwarded, named access is private and adds a login step."],
    p: ["An expired link makes a years-old message useless because the file is gone.", "Forwarding a message with a public link gives unintended people access to a private file."],
    v: "Attach a 100 MB file against a 25 MB limit, confirm the client offers an upload, insert the link, and open it from another account to confirm access and expiry match the choices.",
    dep: ["attachment-extractor", "message-builder", "link-policy"]
  },
  "open-save-policy": {
    s: "Decides how a received file may be opened or saved: which types open directly, which warn, which are blocked, and where they are stored.",
    d: "A type table classifies files by extension and detected type into open, warn, save only and blocked, with different handling for executables, scripts and macro-enabled documents. Saved files get a mark of origin so the operating system can warn later. Temporary opens use a private folder cleared on exit. It is hard because the same file can be harmless or dangerous by context, because double extensions and right-to-left override characters disguise names, and because users find strict rules obstructive and look for workarounds.",
    k: ["Block executables entirely vs allow with a warning: blocking is safest and breaks legitimate transfer, warning respects the user and relies on their judgment.", "Mark saved files with origin metadata vs not: marking enables downstream system checks, but is lost on some file systems and when copied."],
    p: ["A name using a right-to-left override character shows a safe extension while the real one is executable.", "Temporary copies opened from mail remain on disk indefinitely, readable by other users of the machine."],
    v: "Receive a file named with a double extension and an override character, and confirm the displayed name and warning reflect its real type; save a file and confirm the system's origin mark is present.",
    dep: ["attachment-scanner", "attachment-cache"]
  },
  "invite-handler": {
    s: "Recognizes calendar invitations and updates in mail, shows them as events with accept, decline and conflict information, and sends replies in the standard format.",
    d: "Invitation parts use a standard calendar format carried as a mail part. The handler parses the event, matches it to an existing event by identifier and sequence number, and shows changes. Responses are sent as a reply part to the organizer and written to the user's calendar. It is hard because updates and cancellations arrive out of order, recurring events have exceptions, time zone definitions vary, and some invitations are forged to appear from the organizer.",
    k: ["Handle invitations inside the mail client vs hand off to a calendar app: inside is convenient, handoff avoids duplicating calendar logic but breaks the flow.", "Auto-add pending invitations to the calendar vs only on accept: auto-add shows conflicts early, but spam invitations then appear in people's calendars."],
    p: ["Processing an older update after a newer one rolls the event back to a stale time.", "Auto-adding forged invitations places spam events and phishing links in the user's trusted calendar."],
    v: "Send an invitation, accept it, then send an update that moves the time and confirm the calendar shows the new time once; send a cancellation and confirm the event is removed and the reply is sent.",
    dep: ["mime-parser", "sender-authentication", "smtp-client"]
  },
  "key-manager": {
    s: "Stores the user's private keys and certificates and other people's public keys, protects them, and chooses which to use for each message.",
    d: "Keys come from generation, import or a provider's key service. Private keys are held in the operating system's secure storage or a protected file with a passphrase; public keys are kept per address with their validity, usage and trust state. For each send or read the manager picks the right key by address and capability, handling expiry, revocation and multiple keys per identity. It is hard because users lose keys and passphrases, because rotating keys must not break old mail, and because the interface must hide mechanics without hiding risk.",
    k: ["Keys in the secure platform store vs in an app-managed file: platform storage is stronger and may prevent backup, an app file is portable and weaker.", "Automatic key creation vs explicit user setup: automatic raises adoption, explicit setup makes users aware of backup and recovery needs."],
    p: ["A lost private key makes years of encrypted mail permanently unreadable with no recovery.", "An expired or revoked key stays selected, so mail is encrypted to a key the recipient no longer holds."],
    v: "Generate a key, send an encrypted message to a second account, rotate the key, and confirm the new message uses the new key while the old message still decrypts.",
    dep: ["credential-store", "trust-model", "key-discovery"]
  },
  "signature-verifier": {
    s: "Checks digital signatures on messages against the sender's key or certificate and reports valid, invalid, unknown signer or expired, with the reason.",
    d: "For each signed message the verifier finds the signature part, rebuilds the signed bytes, checks them against the signer's public key, and confirms that the key matches the from address, is valid at the time of signing and chains to something trusted. Results are stored with the message. The interface shows a short state and a detail view. It is hard because mail transformations by mailing lists and gateways break signatures, because canonicalization rules are subtle, and because users read 'signed' as 'safe'.",
    k: ["Show only valid and invalid vs richer states: two states are simple and misleading, richer states are accurate and confuse people.", "Verify at sync time and store vs verify on display: storing avoids repeated work but may hold a result that later changes, such as after revocation."],
    p: ["A signature valid for a different address than the visible from shows a green mark for impersonation.", "A mailing list appends a footer, breaking the signature, and users learn to ignore invalid ones."],
    v: "Send signed messages from a test account, then modify one in transit and confirm the first verifies and the second shows invalid with a reason; send from a signer whose certificate has expired and confirm that state.",
    dep: ["key-manager", "trust-model", "mime-parser"]
  },
  "message-encryption": {
    s: "Encrypts outgoing messages to each recipient's key and decrypts incoming ones with the user's private key, including the content and optionally the attachments.",
    d: "On send the client needs a usable key for every recipient, encrypts the content with a random session key and wraps that key for each recipient, plus the sender so the sent copy can be read. On receive it unwraps the session key using the private key and decrypts. Headers such as subject usually remain visible unless protected inside the encrypted part. It is hard because a missing recipient key forces a choice to fail or send in clear, because decrypted content must be kept out of the search index and logs, and because encrypted mail is opaque to servers.",
    k: ["Refuse to send when a key is missing vs fall back to unencrypted: refusing protects confidentiality and blocks urgent mail, falling back keeps flow and leaks silently.", "Protect the subject inside the encrypted part vs leave it in the header: inside hides it but breaks server-side threading and previews."],
    p: ["Encrypting to recipients but not to the sender's own key makes the sent copy unreadable.", "Decrypted bodies written into the plain search index or previews undo the encryption."],
    v: "Send an encrypted message to two recipients and confirm both and the sender can read it, a relay copy shows only ciphertext, and sending to a recipient with no key is blocked with a clear message.",
    dep: ["key-manager", "message-builder", "trust-model"]
  },
  "trust-model": {
    s: "Rules for deciding whether a key or certificate really belongs to an address: certificate authorities, a web of signatures, first-use pinning or direct verification.",
    d: "The model defines what makes a key acceptable and how that is shown. Certificate-based systems chain to authorities the client trusts. Key-based systems use signatures from other people or pin the first key seen and warn on change. Users can verify fingerprints out of band. The model also governs changes: key rollover must be distinguishable from an attack. It is hard because users do not understand trust prompts, because every model has a way to fail, and because mixing several models in one interface confuses.",
    k: ["Authority-based vs first-use pinning: authorities scale and centralize the risk, pinning needs no third party and is weak for first contact.", "Warn loudly on key change vs accept silently: loud warnings catch attacks and are mostly false alarms from reinstalls, silent acceptance hides real attacks."],
    p: ["Users habitually accept every key-change warning, so a real interception looks identical to a reinstall.", "Trusting a certificate for any address on a domain lets one compromised mailbox sign for all."],
    v: "Change a contact's key on the test account and confirm the client flags the change with the old and new fingerprints and requires a deliberate action before treating the new key as verified.",
    dep: ["key-manager"]
  },
  "key-discovery": {
    s: "Finds a recipient's public key or certificate automatically, from key servers, directories, DNS records, the sender's earlier mail or provider lookups.",
    d: "Sources include keys attached or embedded in signed messages, a recipient domain's published key location, organizational directories and public key servers. The client checks the key matches the address, is not expired or revoked, and applies the trust rules before using it. Lookup results are cached. It is hard because lookups reveal who the user is about to write to, because key servers accept unverified uploads, and because outdated cached keys cause failed decryption.",
    k: ["Look up the key at compose time vs at send time: at compose shows encryption status as the user types but leaks intent, at send is later and gives less warning.", "Accept keys found on public servers vs only verified sources: public servers cover more people, verified sources prevent planted keys."],
    p: ["A planted key on a public server for a victim's address means the user encrypts to an attacker.", "Querying a lookup service per keystroke tells that service everyone the user considers writing to."],
    v: "Write to a test address that publishes a key through the supported method and confirm the client finds it, shows encryption available, and does not query anything for addresses typed but not sent to.",
    dep: ["key-manager", "directory-lookup", "network-awareness"]
  },
  "sender-authentication": {
    s: "Shows the results of sender checks recorded by the receiving server (such as SPF, DKIM and DMARC) and what they mean for whether the from address can be trusted.",
    d: "Receiving servers verify that the sending server is permitted for the domain and that the message's domain signature is valid, and record results in a header added on arrival. The client reads only the header from its own server, ignoring any copies added upstream, and maps results to a display such as a verified sender mark or a warning. Without that header, the client cannot verify anything itself. It is hard because results are about a domain and not a person, and because forwarding legitimately breaks some checks.",
    k: ["Trust the server's authentication header vs verify independently: trusting is cheap and requires a honest server, independent checking needs the original delivery path and DNS access the client lacks.", "Mark verified senders with a positive indicator vs only warn on failure: positive marks reassure, warnings only keep attention for exceptions."],
    p: ["Trusting an authentication header that was inserted by an upstream sender instead of the user's own server shows a forged pass.", "A pass for the envelope domain shown as verification of a different visible from address misleads users."],
    v: "Send a message from a domain without proper authentication and a spoofed from address, and confirm the client shows a failure for it, while mail from a properly configured domain shows verified.",
    dep: ["imap-client", "mime-parser"]
  },
  "encrypted-indexing": {
    s: "Decides how encrypted messages are searched and previewed: not at all, from a decrypted local index kept protected, or by deferring until the message is opened.",
    d: "Encrypted bodies are opaque ciphertext, so normal indexing finds nothing. Options are to decrypt during sync and index into a protected store, to index only the visible headers, or to search only what has been opened. The protected index shares the same lifetime and storage protection as the keys. Snippets and notification text face the same question. It is hard because every option trades usability against exposing the plaintext on the device and in backups.",
    k: ["Decrypt and index locally vs leave encrypted mail unsearchable: indexing makes encryption usable at the cost of a plaintext derivative that needs strong protection.", "Show decrypted notification text vs a generic message: text is useful and appears on lock screens, generic text is private and less helpful."],
    p: ["A plaintext search index of encrypted mail is included in device backups, defeating the encryption.", "A notification previewing encrypted content shows it on a locked screen."],
    v: "Search for a word that appears only in an encrypted message and confirm the chosen behavior holds: with indexing, it is found and the index file contains no readable text on disk; without it, no result and a clear message.",
    dep: ["search-index", "encryption-at-rest", "key-manager"]
  }
});
