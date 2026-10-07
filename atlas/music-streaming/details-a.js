// Details for the music streaming plate, part 1: player and client, library and playlists.
ATLAS.details("music-streaming", {
  "playback-engine": {
    s: "The client component that fetches encoded audio, decodes it, and feeds samples to the output device in a steady stream, exposing play, pause, seek and position to the rest of the app.",
    d: "The engine opens a stream resolved by the backend, reads container headers, decodes frames on a worker thread and writes PCM into a ring buffer that the audio callback drains on a hard real-time schedule. It tracks position by samples actually played, not by wall time. Seeking needs an index into the file or segment list. It must handle codec switches, stream errors, and the operating system pausing the app. The hard part is that the audio callback may never block or wait on the network.",
    k: ["Software decoding in the app vs platform decoders: software gives identical behavior and gapless control everywhere; platform decoders save battery but differ in edge-case behavior per device.", "Position from samples played vs from the clock: sample counting stays accurate across underruns and rate changes, but needs care when the output device resamples."],
    p: ["Allocating memory or taking a lock inside the audio callback causes audible glitches under load that never reproduce in a quiet test.", "Reporting the decoded position instead of the heard position makes lyrics, scrobbles and handoff run ahead of the sound by the buffer length."],
    v: "Play a one-hour test tone while throttling the network to zero for ten seconds mid-track and confirm there is no click or dropout until the buffer empties, and that position resumes correctly when data returns.",
    dep: ["prefetch-and-buffering","segment-and-range-serving","audio-output-routing"]
  },
  "gapless-and-crossfade": {
    s: "Joins consecutive tracks without an audible gap, or overlaps them deliberately, by preparing the next decoder and trimming codec padding at track boundaries.",
    d: "Lossy codecs add priming samples at the start and padding at the end of each file, so naive playback inserts tens of milliseconds of silence between tracks. The service stores trim offsets per file, preloads the next track before the current ends, and splices at the exact sample. Crossfade mixes the tail of one decoder with the head of another using a gain curve, which needs two live decoders and a mixer. Live albums and mixed sets expose any mistake immediately.",
    k: ["Trim data stored at encode time vs detected on the client: stored offsets are exact and cheap to apply, but every encoder path must produce them correctly; client detection costs CPU and guesses.", "Preloading the next track early vs late: early guarantees no gap but wastes data when the listener skips; late saves bandwidth and risks a stall."],
    p: ["Encoding a continuous album as independent files without carrying the trim offsets puts a gap in the middle of tracks meant to flow together.", "Applying crossfade to albums marked gapless breaks the artist's intended transitions."],
    v: "Play a known album with seamless transitions on the target device and record the output; confirm no silence longer than one sample period at the boundaries, and the waveform join is continuous.",
    dep: ["playback-engine","prefetch-and-buffering","segment-packaging"]
  },
  "adaptive-bitrate-client": {
    s: "Chooses which quality version of a track to fetch next by estimating throughput and buffer level, switching up or down between segments to avoid stalls.",
    d: "Each track is available as a ladder of bitrates. The client measures recent download speed, tracks how many seconds are buffered, and picks the highest rung it expects to finish before the buffer drains. User settings cap the choice, such as data saver or maximum quality on Wi-Fi. Switching happens on segment boundaries so the decoder sees a clean cut. Audio rungs are close in size, so the gain from adapting is smaller than for video and the cost of a bad estimate is a stall.",
    k: ["Throughput-based vs buffer-based selection: throughput reacts quickly to changes but is noisy; buffer-based is stable but slow to recover when the network improves.", "Switching mid-track vs fixing quality per track: mid-track switching handles degraded networks but can make a quality change audible; per-track is simpler and predictable."],
    p: ["Estimating throughput from tiny requests underestimates the link and keeps listeners on low quality on a fast connection.", "Ignoring the user's quality setting after a network change silently spends mobile data."],
    v: "Replay a recorded network trace that drops from 2 Mbit/s to 100 kbit/s mid-track and confirm the client steps down, plays through with no stall, and steps back up when the trace recovers.",
    dep: ["playback-engine","codec-ladder","delivery-telemetry"]
  },
  "prefetch-and-buffering": {
    s: "Downloads audio ahead of the playhead and keeps the start of likely next tracks in memory or on disk, so play starts instantly and survives brief network loss.",
    d: "The buffer holds a target number of seconds ahead, larger on mobile networks with coverage gaps. Prefetch looks at the queue and fetches the first segments of the next tracks, and may also warm likely choices such as the first track of a playlist when it is opened. Caches on disk persist recently played tracks. Policies depend on battery, data plan and storage. The tension is that every speculative fetch costs the listener data and the service delivery bandwidth.",
    k: ["Aggressive prefetch vs fetch on demand: aggressive gives instant starts and gapless joins; on-demand saves data and avoids wasted delivery for tracks never played.", "A persistent disk cache vs memory only: disk makes replays free and offline-like, but needs size limits, encryption for licensed content, and eviction logic."],
    p: ["Prefetching on a metered connection exhausts a monthly data allowance and generates complaints about a free service.", "A cache that never evicts fills device storage and the OS reports the app as the cause."],
    v: "On a cold start, tap a track and measure the time to first sound against the target, then in airplane mode confirm the next queued track still starts from its prefetched segments.",
    dep: ["segment-and-range-serving","play-queue-state","adaptive-bitrate-client"]
  },
  "play-queue-state": {
    s: "The ordered list of what plays now and next, with shuffle, repeat, user-added items and the context it came from, kept consistent across the client and the backend.",
    d: "A queue is built from a context, such as an album or playlist, plus items the listener adds explicitly, which take priority. Shuffle permutes the context without repeating until exhausted, and many services avoid pure randomness because it feels unrandom. Repeat modes, skipped unavailable tracks and autoplay appending when the queue ends all modify it. The queue is also shared state: other devices and the handoff feature read it, so changes must be versioned and merged.",
    k: ["Shuffle with true randomness vs a spread-out permutation: true random produces clusters of the same artist that listeners read as bugs; spreading is nicer but needs per-context logic.", "Queue held only on the client vs mirrored on the server: client-only is simple and works offline, but handoff and remote control need the server copy and a conflict rule."],
    p: ["Regenerating a shuffle on every app launch breaks the listener's place in a long playlist.", "A context that changed while queued, such as a track removed from a playlist, makes the queue disagree with what the listener sees."],
    v: "Queue ten items, shuffle, add two explicit tracks, then force-close and reopen the app: confirm the explicit tracks are next, the shuffle order and position persist, and no item repeats before the set is exhausted.",
    dep: ["playlist-service","radio-and-autoplay","user-data-store"]
  },
  "device-handoff": {
    s: "Lets a listener see and control playback on any of their devices, and move it between them, by treating the session as shared state held by the backend.",
    d: "Each active device registers over a persistent connection and reports its state: track, position, volume, and capabilities. A controller device sends commands such as transfer, pause or volume change, which the backend routes to the target device. Only one device holds the active playback at a time for the account, and starting playback on a second device stops the first. Speakers, cars and consoles join as controllable endpoints. The difficulty is presence: devices vanish without disconnecting, and commands race with the user's own taps.",
    k: ["Backend-routed commands vs direct device-to-device on the local network: backend routing works anywhere and enforces the one-active-device rule; local control is lower latency but fails across networks.", "Strict single active stream vs allowing several: strict matches most licenses and prevents account sharing, but needs a fast, reliable takeover protocol."],
    p: ["Treating a device as online after its connection silently dropped leaves commands going into a void and the app showing a ghost player.", "Two devices both believing they own playback produces dueling pause and play commands."],
    v: "Start playback on a phone, transfer to a speaker from a laptop, and confirm the phone stops within about a second, the speaker resumes within a second of the saved position, and the queue is identical.",
    dep: ["play-queue-state","identity-and-sessions","service-gateway"]
  },
  "offline-download-manager": {
    s: "Lets a listener save playlists and albums to the device for playback without a connection, managing queues, storage limits, encryption and license renewal.",
    d: "The manager keeps a list of items marked for offline, resolves each track to a downloadable file, fetches it in the background with resumable transfers, and stores it encrypted with an offline license. It reconciles the list when tracks change or are withdrawn, enforces per-device track and storage limits, and prioritizes by what the listener will play next. Playback of downloaded files uses the same engine. The hard parts are background execution limits on mobile operating systems and keeping local files consistent with a catalog that keeps changing.",
    k: ["Download whole collections eagerly vs on demand: eager guarantees offline readiness at the cost of storage and data; on demand saves both but fails the moment connectivity is lost.", "Re-download when the file changes vs keep the old copy: refreshing keeps correct versions and fixes errors, but spends bandwidth and can interrupt a trip."],
    p: ["Marking a download complete when the file is present but the license failed to arrive leaves tracks that show downloaded and refuse to play.", "Ignoring the OS background transfer budget makes large downloads stall silently until the app is reopened."],
    v: "Download a 100-track playlist on Wi-Fi, switch to airplane mode, and confirm every track plays; then remove one track from the playlist on another device and confirm the local copy is deleted at next sync.",
    dep: ["offline-license-lifecycle","download-storage-format","stream-resolver","library-sync"]
  },
  "audio-output-routing": {
    s: "Connects playback to speakers, headphones, wireless and network audio targets, handling device changes, interruptions, volume and lock screen controls.",
    d: "The operating system owns the output devices, so the app declares an audio session category, registers for route-change and interruption notifications, and responds: pause when headphones are unplugged, duck for a navigation prompt, resume after a call ends. Wireless transports add latency and codec limits, and some targets such as cast-style speakers pull the stream themselves instead of receiving samples. Media keys and lock screen widgets send transport commands back to the engine. The challenge is the number of device and OS combinations.",
    k: ["Pushing decoded audio to the output vs handing the target a stream address: pushing works with any output but ties up the phone; handing off saves battery but depends on target support and license rules.", "Resuming automatically after an interruption vs staying paused: resuming is convenient but surprises people if the interruption was long or the context changed."],
    p: ["Continuing to play out loud when headphones disconnect is a privacy incident that users remember.", "Wireless latency of a few hundred milliseconds shifts synchronized lyrics and visuals out of time."],
    v: "Play to wired headphones and unplug them; confirm playback pauses at once. Receive a call, end it, and confirm playback resumes only when the policy says it should.",
    dep: ["playback-engine"]
  },
  "playlist-service": {
    s: "Stores and serves ordered lists of tracks owned by listeners and editors, with create, reorder, add and remove operations, versions and follower counts.",
    d: "A playlist is metadata plus an ordered list of track references and a revision number. Edits are sent as operations against a base revision, such as insert at position, and the service returns the new revision. Reads must be fast for lists of thousands of items and are heavily cached, with large editorial lists served from the edge. A playlist stores references, not copies, so it depends on the catalog to resolve what each item currently is. Hardness comes from concurrent edits and from very popular lists with millions of followers.",
    k: ["Operation-based edits vs whole-list replace: operations merge concurrent changes and are small on the wire; replace is simpler but loses the other editor's work.", "Reference by recording id vs by a resolved version: ids keep playlists correct as the catalog changes; storing the version avoids surprises but preserves withdrawn items."],
    p: ["A bulk import of ten thousand tracks as individual operations overloads the service and times out halfway, leaving a partial list.", "Tracks removed from the catalog leave dead rows that show gray with no explanation."],
    v: "Create a playlist, apply twenty reorder operations from two clients at once, and confirm both clients converge on the same final order with no lost or duplicated item.",
    dep: ["user-data-store","entity-identity-model","availability-resolver","metadata-serving-store"]
  },
  "collaborative-playlists": {
    s: "Lets several listeners edit one playlist, with attribution, permission levels and a merge strategy so concurrent changes do not overwrite each other.",
    d: "Collaborators receive an invitation link, join with edit rights, and their operations are applied to a shared revision history. The server sequences operations, transforms concurrent ones so positions stay meaningful, and broadcasts changes to open clients over a push channel. Each added track records who added it. Owners can revoke access or lock the list. The difficulty is intent: two people moving an item to different places at once has no correct answer, only a deterministic one, and vandalism by a link shared too widely is a real risk.",
    k: ["Server-sequenced operation transforms vs conflict-free replicated lists: transforms are straightforward with a central server; replicated lists work offline but make removals and history harder to reason about.", "Open invite link vs named invitees: links spread fast and are convenient, but cannot be bounded once leaked."],
    p: ["Applying operations by absolute position after another edit shifted the list moves the wrong track.", "No rate limit on additions lets one collaborator or script bury the list under spam."],
    v: "Have two clients concurrently insert at the same index and delete the same track; confirm the server's outcome is identical on both, attribution is correct, and the deleted track is gone once.",
    dep: ["playlist-service","identity-and-sessions","friend-graph"]
  },
  "saved-library": {
    s: "The listener's own collection of saved tracks, albums, artists and followed playlists, kept separate from playlists so saving is one tap and always available.",
    d: "The library is a set of typed references per account with save timestamps, supporting fast membership checks because every list in the app shows a saved indicator. Reads batch dozens of ids per request. Sorting and filtering by recency, artist or download state happens on the client for small libraries and via the service for very large ones. Saved items interact with rights: an album can become unavailable but remains saved so it returns if licensing does.",
    k: ["Storing saved items as a set with timestamps vs as a special playlist: a set makes membership checks and unsaving cheap; a playlist reuses machinery but treats a heart-tap like an edit.", "Hiding unavailable saved items vs showing them grayed: hiding keeps lists tidy, but silent disappearance looks like data loss."],
    p: ["Per-item membership calls for every row of a long list swamp the backend; they must be batched.", "Saving a track id that later merges into another recording leaves the listener's save pointing at a redirect that no longer resolves."],
    v: "Save 2,000 items across several devices, then open a long list and confirm saved indicators appear in a single batched round of requests and match the library on every device.",
    dep: ["user-data-store","entity-identity-model","library-sync"]
  },
  "library-sync": {
    s: "Propagates library, playlist and setting changes among a listener's devices so each shows the same state shortly after a change, including after being offline.",
    d: "Each client keeps a local database and a sync cursor. It sends pending local changes, receives remote changes since the cursor, and applies them with a per-entity merge rule such as last writer wins for settings and operation merge for lists. Push notifications nudge idle devices to pull. Deletes are kept as tombstones until all devices pass them. It is hard because changes may be hours old when they arrive, the same item can change on two devices, and clock skew makes timestamps untrustworthy.",
    k: ["Server-assigned revision cursors vs client timestamps: cursors give a total order immune to clock skew; timestamps are simpler but can drop edits from a device with a wrong clock.", "Full resync after errors vs incremental repair: full resync is always correct but expensive for large libraries; incremental repair is cheap and needs careful invariants."],
    p: ["Dropping tombstones too early makes a long-offline device resurrect deleted items.", "Syncing the entire library on every launch makes startup slow and costs the backend a read per active user."],
    v: "Edit the same playlist on two devices while one is in airplane mode, reconnect it, and confirm both converge within seconds to the merged state with no resurrected deletions.",
    dep: ["user-data-store","playlist-service","identity-and-sessions"]
  },
  "listening-history": {
    s: "A per-listener record of what was played and when, used for the recently played view, resuming, recommendation features and, in aggregate, for royalty and chart reporting.",
    d: "Client play events flow into the event pipeline, which writes a compact per-user history store holding the last few thousand plays for quick display, while the complete record goes to the data lake. Entries are keyed by track and context, with skip and completion information. Private sessions suppress writes to the visible history and to recommendation signals. The challenge is volume and retention: history is the largest growing dataset per user and is also personal data that must be exportable and erasable.",
    k: ["Recent window in a serving store plus full history in the lake vs one store: two stores match query shapes and cost; one is simpler but expensive to read from for the app.", "Recording on the client vs inferring on the server: client events carry accurate position and skip data; server inference misses offline plays."],
    p: ["Offline plays uploaded days later arrive out of order and with stale session information, confusing deduplication.", "Private session mode that still feeds recommendations leaks exactly what the listener tried to hide."],
    v: "Play three tracks, one in private mode, and confirm the recent view lists only the two, the lake has the full records marked accordingly, and an erasure request removes both within the stated deadline.",
    dep: ["event-pipeline","user-data-store","data-lake","profile-and-privacy"]
  },
  "lyrics-and-credits": {
    s: "Supplies time-synced lyrics, translations and songwriter, performer and producer credits for each recording, from licensed sources, shown alongside playback.",
    d: "Lyrics come from rights-licensed providers in plain and line- or word-timed forms, matched to a recording by identifier and verified by duration and fingerprint. The player highlights lines using the played position. Credits are part of the catalog metadata and link to artist pages. Matching is the hard part: the same song exists as many recordings and edits, and lyrics timed to one version drift on another. Lyric text is itself licensed, and some territories or tracks have none.",
    k: ["Lyrics keyed to the recording vs to the composition: recording keys give correct timing for that version; composition keys cover more tracks but need an offset and fail on edits.", "Showing lyrics inline from a licensed provider vs linking out: inline is the better experience but needs a license, display rules and reporting."],
    p: ["Timing from a radio edit applied to the album version highlights the wrong line for the whole track.", "Showing lyrics in a territory where the license does not cover them is a contract breach, not a bug."],
    v: "Open a track with word-timed lyrics, seek to three points, and confirm the highlighted line matches the audio at each; open a track with no license in a restricted territory and confirm nothing is shown.",
    dep: ["metadata-serving-store","identifier-registry","playback-engine","territory-availability"]
  },
  "profile-and-privacy": {
    s: "Holds the listener's profile, visibility choices and consent settings, and enforces them across history, social features, recommendations and exports.",
    d: "Settings include public or private profile, whether activity is shown to followers, private sessions, personalization consent and ad preferences. Because many services read the same user data, privacy is enforced as a policy lookup performed by each consumer, or as filtering at the data store, not as UI hiding. The subsystem also runs data export and account deletion, which must reach every store and the lake. It is hard because defaults, regional law and old data written under old rules all interact.",
    k: ["Central policy service checked by consumers vs each service holding its own copy: central is auditable and consistent, but adds latency and a hard dependency; copies are fast but drift.", "Delete by erasure across all stores vs by marking and filtering: erasure is compliant and final; filtering is faster to build but leaves personal data in storage."],
    p: ["A new feature launched without checking the private-session flag exposes listening that users believed was hidden.", "Deletion requests that miss the data lake or backups leave personal data after the deadline."],
    v: "Turn on private session, play a track, and confirm it is absent from the activity feed, history view and recommendation inputs; then request deletion and confirm every store reports the account as erased.",
    dep: ["user-data-store","identity-and-sessions","data-lake"]
  },
});
