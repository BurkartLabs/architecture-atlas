// Details for the identity provider plate, part 3: protocol endpoints, tokens, signing keys.
ATLAS.details("identity-provider", {
  "authorization-endpoint": {
    s: "The browser-facing endpoint that receives an application's request, authenticates the user, obtains consent and returns an authorization code or response to the registered redirect address.",
    d: "The request carries the client identifier, redirect address, scopes, a state value, a nonce and a code challenge. The endpoint validates them against the client registry before showing anything, runs the sign-in flow if no suitable session exists, applies consent and policy, and redirects with a short-lived code. Parameters can be passed by reference in a signed request object. It is hard because it is driven by the browser and by untrusted input: every parameter is attacker-controlled, and errors must not redirect to an unvalidated address.",
    k: ["Validating the request before any redirect vs reporting errors to the supplied address: validating first prevents open redirects, but means some errors can only be shown on the provider's own page.", "Pushed authorization requests vs parameters in the browser URL: pushing sends parameters directly and authenticated, which blocks tampering but adds a round trip and client support."],
    p: ["Redirecting an error to an unregistered address turns the provider into an open redirector.", "Ignoring a missing state or nonce allows cross-site request forgery and replay at the application."],
    v: "Send requests with an unregistered redirect address, an unknown client, an unsupported response type and valid parameters, and confirm the first three produce no redirect and the last returns a code with the same state.",
    dep: ["redirect-uri-validation","client-registry","flow-orchestration","consent-screens","session-store"]
  },
  "token-endpoint": {
    s: "The back-channel endpoint where applications authenticate and exchange codes, refresh tokens or credentials for tokens, never reached through the user's browser.",
    d: "It authenticates the client by secret, signed assertion or certificate, identifies the grant type, validates the grant, checks the request against what the client may do, and returns an access token, optionally an identity token and a refresh token. Each grant has its own checks, shared client authentication and shared error handling. It is the busiest and most attacked endpoint, so it is stateless where it can be, rate limited, and records each issuance. A subtle error here is a full account takeover for every client.",
    k: ["One endpoint dispatching on grant type vs separate endpoints per grant: one endpoint matches the standard and shares client authentication, but concentrates risk and complexity in a single code path.", "Strict error detail vs generic errors: standard error codes help developers, while too much detail helps attackers distinguish stolen from invalid values."],
    p: ["Skipping client authentication for a confidential client lets anyone holding a stolen code redeem it.", "Allowing a code to be redeemed twice enables replay without detection."],
    v: "Redeem one authorization code twice and confirm the second attempt fails and, per policy, tokens from the first are revoked, then redeem with a wrong client secret and confirm no token is issued.",
    dep: ["client-registry","workload-credentials","access-token-formats","authorization-code-flow","refresh-token-flow"]
  },
  "authorization-code-flow": {
    s: "The standard sequence for applications acting for a user: browser redirect, sign-in, a one-time code returned to the application, then a back-channel exchange for tokens.",
    d: "The application sends the user to the authorization endpoint, the user authenticates, and the provider returns a code bound to the client, redirect address and code challenge. The application's server or app exchanges it at the token endpoint. Tokens never pass through the browser address bar, and the code is single-use with a lifetime under a minute. It is the base of most other flows. Failures come from incomplete implementations: missing state validation, long-lived codes and clients that skip the proof key.",
    k: ["Code flow with a proof key for all clients vs implicit tokens in the redirect: code flow keeps tokens out of URLs and history, at the cost of an extra request.", "Binding the code to the browser session vs to the client only: session binding resists code injection, but is hard where flows cross devices."],
    p: ["Codes valid for minutes give an attacker who captured one time to use it.", "Applications that do not check state accept a code planted by an attacker for the attacker's account."],
    v: "Run the flow end to end with a test client, confirm the code is single-use and expires within the stated time, and that a code issued to one client is rejected when presented by another.",
    dep: ["authorization-endpoint","token-endpoint","pkce-verification","redirect-uri-validation"]
  },
  "pkce-verification": {
    s: "A check that the client redeeming an authorization code is the same one that started the request, by comparing a hash of a secret it created against its original value.",
    d: "The client creates a random verifier, sends its hash as a challenge with the authorization request and presents the verifier at the token endpoint. The provider stores the challenge with the code, hashes the verifier and compares in constant time. An intercepted code is useless without the verifier. The provider should require it for public clients and ideally all, and refuse the weak plain method. Downgrade is the danger: if requests without a challenge are accepted, an attacker simply omits it.",
    k: ["Requiring the proof key for every client vs only public ones: requiring it everywhere protects confidential clients from code injection, but breaks old clients.", "Accepting the plain method vs the hashed method only: plain is simpler for tiny clients, but defeats the purpose if the challenge itself is observed."],
    p: ["Accepting a code redeemed with no verifier when none was sent lets attackers downgrade the exchange.", "Storing the challenge outside the code record allows it to be swapped between requests."],
    v: "Start a flow with a challenge, then redeem with a wrong verifier, no verifier and the right verifier, and confirm only the last succeeds; then start a flow without a challenge for a public client and confirm it is refused.",
    dep: ["token-endpoint","authorization-endpoint"]
  },
  "client-credentials-flow": {
    s: "A grant where a program authenticates as itself, with no user present, and receives a token for the permissions assigned to it.",
    d: "The client authenticates at the token endpoint and requests scopes or an audience. The provider checks them against what was granted to that client and issues a short-lived access token with the client as subject. It carries no user and no refresh token. It serves service-to-service calls, scheduled jobs and automation. The main risk is power without a person: a leaked client credential is a full identity, so scopes should be narrow, lifetimes short and issuance monitored.",
    k: ["One client per workload vs shared clients: separate clients give individual revocation and logs, but multiply credentials to manage.", "Tokens carrying broad scopes vs requested per call: per call limits blast radius if a token leaks, but needs callers to ask correctly each time."],
    p: ["A shared client credential used by dozens of services cannot be rotated without coordinated downtime.", "Granting administrative scopes to a client for convenience gives every holder of the secret administrative reach."],
    v: "Authenticate a test client, request a scope it was not granted and confirm refusal, request a granted scope and confirm a short-lived token whose subject is the client and has no user claims.",
    dep: ["token-endpoint","workload-credentials","scopes-and-audiences"]
  },
  "refresh-token-flow": {
    s: "A grant that exchanges a long-lived, rotating refresh token for new access tokens, so users stay signed in without repeated prompts.",
    d: "At issuance the provider stores the refresh token, or its hash, tied to the user, client, scopes and session. On use it checks validity, may check that the session is still alive, issues new tokens and, with rotation, returns a new refresh token and invalidates the old. Reuse of an old token signals theft, so the provider revokes the whole family. It is hard because it is a long-lived bearer secret held in places like phones and browsers, and rotation interacts badly with flaky networks.",
    k: ["Rotating on every use vs a stable token: rotation detects theft through reuse, but a lost response can leave the client with an invalidated token and a forced login.", "Absolute lifetime vs sliding lifetime: sliding keeps active users in, while absolute bounds the exposure of a stolen token."],
    p: ["Treating a duplicate use caused by a retry as theft revokes the family and logs out a real user.", "Refresh tokens that survive password change and factor reset let an attacker keep access."],
    v: "Use a refresh token, then present the previous one again and confirm the family is revoked and an event is logged, and confirm a password change invalidates all outstanding refresh tokens for the user.",
    dep: ["token-endpoint","session-store","token-lifetimes","token-revocation"]
  },
  "device-authorization-flow": {
    s: "A grant for devices without a usable browser or keyboard: the device displays a code, the user approves on another device, and the device polls until tokens are ready.",
    d: "The device requests a device code and a short user code, shows the user code and an address, and polls the token endpoint at the given interval. Meanwhile the user signs in elsewhere and approves. The provider links the approval to the pending request. Responses tell the device to wait, slow down or stop. The danger is the gap between who starts and who approves: user codes must resist guessing, and approval pages must make clear what is being authorized.",
    k: ["Polling by the device vs push to the device: polling works on any device and is simple, but costs requests and delay.", "Short user codes vs long ones: short ones are typeable on a television, but need strict attempt limits and short lifetimes."],
    p: ["A device that ignores the slow-down response floods the endpoint and gets rate limited.", "Approval of a code that someone else initiated grants a stranger's device access to the user's data."],
    v: "Start a flow from a test device, approve on a browser and confirm the device receives tokens on its next poll, then let a code expire and confirm polling returns the expired error.",
    dep: ["token-endpoint","device-code-screens","rate-limiting"]
  },
  "redirect-uri-validation": {
    s: "Exact comparison of the requested redirect address against the addresses registered for the client, preventing authorization codes from being sent to attackers.",
    d: "The provider requires the redirect address in the request to match a registered value character for character, apart from permitted variations for native applications on a loopback address with any port. Wildcards, prefix matches and subdomain patterns are avoided. The check applies at both the authorization and token endpoints. It looks trivial and is a leading source of real account takeovers, because parsers disagree about what a URL means, and attackers exploit path tricks and open redirects on registered hosts.",
    k: ["Exact match vs pattern match: exact is safe and simple, while patterns suit many preview environments but let attackers land on addresses they control.", "Allowing custom application schemes vs verified web links: custom schemes work everywhere but can be claimed by a malicious app, while verified links are bound to the owner."],
    p: ["Registered addresses that include an open redirect on the same host let attackers bounce the code to their own site.", "Comparing after normalization differently from the application's own parser lets crafted addresses pass."],
    v: "Request with registered address plus an appended path, a different port, a different case in the host and a userinfo trick, and confirm only the exact registered form is accepted.",
    dep: ["client-registry"]
  },
  "userinfo-and-introspection": {
    s: "Endpoints that let applications fetch profile claims for a token, and let resource servers ask whether an opaque token is active and what it grants.",
    d: "The userinfo endpoint returns claims allowed by the token's scopes. Introspection takes a token from an authenticated caller and returns whether it is active with its subject, client, scopes and expiry, so resource servers can check tokens that are not self-contained and see revocations immediately. Both depend on the same token store and must be fast. The cost is availability and load: each introspected call becomes a request to the provider, and callers must decide what to do when it is down.",
    k: ["Introspection on every request vs local verification of signed tokens: introspection sees revocation at once, while local checks are fast and keep working when the provider is down.", "Caching introspection results briefly vs never: caching reduces load, but extends the window in which a revoked token still works."],
    p: ["Allowing any client to introspect any token lets a malicious application probe stolen tokens.", "Resource servers that fail open when introspection is unreachable accept revoked tokens during outages."],
    v: "Introspect an active token and a revoked one using a resource server's credentials and confirm active and inactive responses, and confirm another client's credentials cannot read the first client's token details.",
    dep: ["access-token-formats","token-revocation","claims-mapping"]
  },
  "discovery-metadata": {
    s: "A published document describing the provider's endpoints, supported features, algorithms and key location, so clients configure themselves from one address.",
    d: "The provider serves a well-known document with its issuer identifier, endpoint addresses, supported scopes, grant types, signing algorithms and the location of its key set. Clients and libraries fetch it at startup and cache it. Each tenant may have its own issuer and document. It looks passive, yet it is the root of client trust: an attacker who alters it can redirect clients to hostile endpoints, and an inconsistent issuer value causes token validation failures.",
    k: ["One document per tenant issuer vs one shared document: per tenant keeps keys and policies separate, but multiplies documents and caches.", "Advertising only what is enabled vs everything possible: accurate metadata prevents clients choosing unsupported options, but must be regenerated when configuration changes."],
    p: ["An issuer value in the document that differs from the one in tokens by a trailing slash breaks every validating client.", "Serving the document over a cache that ignores freshness keeps clients on a retired endpoint."],
    v: "Fetch the document, confirm the issuer equals the issuer claim in a freshly issued token, and that every listed endpoint answers, then change a setting and confirm the document reflects it.",
    dep: ["jwks-publishing","tenant-configuration"]
  },
  "token-revocation": {
    s: "An endpoint and internal mechanism to invalidate refresh tokens, sessions and, where possible, access tokens before they expire.",
    d: "Clients call a revocation endpoint to discard their own tokens, and the provider revokes on logout, password change, deactivation and detected theft. Refresh tokens are marked invalid in storage. Self-contained access tokens cannot be recalled, so the provider keeps a revocation list or short lifetimes and relies on resource servers to check. It is hard because revocation must reach every place a token is cached or accepted, and a distributed system has no instant global state.",
    k: ["Revocation lists distributed to resource servers vs short lifetimes only: lists close the gap sooner but add distribution and failure modes, while short lifetimes are simple and leave a window.", "Revoking a whole token family vs one token: family revocation stops theft, but logs out legitimate sessions on false alarms."],
    p: ["Revoking the refresh token but not the session lets the user's browser mint new tokens at once.", "A revocation list that grows without pruning slows every verification."],
    v: "Revoke a refresh token and an active session and confirm refresh fails immediately, then measure how long a previously issued access token is still accepted and compare that with the documented bound.",
    dep: ["session-store","cache-layer","access-token-formats"]
  },
  "id-tokens": {
    s: "A signed statement for the application that a particular user authenticated at a particular time through a particular method, intended for the client and not for calling APIs.",
    d: "The token carries issuer, subject, audience equal to the client, issue and expiry times, a nonce echoing the request, authentication time and method references, and requested profile claims. It is signed with the provider's key and verified by the client using the key set. Subjects are stable identifiers, sometimes unique per client to prevent correlation. It is hard because clients misuse it: using an identity token to call an API, trusting its claims without checking issuer, audience and nonce, or treating email as an identifier.",
    k: ["Subject identifiers pairwise per client vs one global identifier: pairwise limits tracking across applications, but complicates integrations that need to join users.", "Claims inside the token vs fetched from userinfo: embedding saves a call, while fetching keeps tokens small and claims fresh."],
    p: ["Clients that skip audience validation accept a token minted for another application.", "Using the email claim as the user key lets a changed or reassigned address move an account to a stranger."],
    v: "Decode a freshly issued token and confirm issuer, audience, nonce, authentication time and subject are present, then verify with the published key and confirm a token with a changed audience fails.",
    dep: ["claims-mapping","signing-key-store","token-lifetimes"]
  },
  "access-token-formats": {
    s: "The representation of tokens used to call APIs: a self-contained signed token that resource servers verify locally, or an opaque reference that they look up.",
    d: "Self-contained tokens carry subject, audience, scopes, issuer, expiry and identifier, signed so resource servers verify offline using the key set. Opaque tokens are random strings resolved by introspection. Some systems encrypt claims or issue both, a reference for outside use and a signed one internally. Choice affects revocation, privacy, size and who can read claims. The hard part is that tokens outlive their context: permissions inside them are frozen at issuance, and any application that can see the token can copy it.",
    k: ["Self-contained signed tokens vs opaque references: signed ones scale and survive provider outages, while opaque ones revoke at once and hide claims from clients.", "Short audience-specific tokens vs one token for many APIs: audience-specific tokens limit damage when one API leaks them, but need more issuance."],
    p: ["Putting sensitive attributes in a signed but unencrypted token exposes them to every client and log that handles it.", "Resource servers that do not check the algorithm header accept tokens signed with none or a swapped algorithm."],
    v: "Verify a token offline with the published key, change one scope character and confirm verification fails, then present it to an API with a different audience and confirm refusal.",
    dep: ["signing-key-store","scopes-and-audiences","token-lifetimes","claims-mapping"]
  },
  "claims-mapping": {
    s: "The rules that decide which user attributes and computed values appear as claims in each token, per application and scope.",
    d: "Attributes from the user store, groups, roles and federation assertions are transformed by mappers: renamed, filtered, concatenated or derived. Mappers apply per client and per scope, so one user gets different claims for different applications. Minimization is the goal: send only what the application needs. It is hard because claims copy data into systems the provider does not control, and because names and formats differ across applications, so teams add custom mappers that become fragile code.",
    k: ["Per-client mapping vs a global claim set: per client minimizes disclosure, but multiplies mapping configuration and makes behavior harder to compare.", "Computing claims at issuance vs reading stored values: computing keeps them current but costs time on the hot path."],
    p: ["Mapping a user-editable attribute into a role claim lets users promote themselves.", "A mapper that fails silently drops a claim, and the application treats the missing value as no permissions or as defaults."],
    v: "Issue tokens for two applications with different mapping rules for one user and confirm each contains only its own claim set, and that an attribute not mapped never appears.",
    dep: ["user-store","group-and-role-mapping","scopes-and-audiences","data-minimization"]
  },
  "scopes-and-audiences": {
    s: "Scopes name permissions a client is requesting; audiences name which resource server a token is meant for. Together they limit what a token can do and where.",
    d: "Resource servers register scopes and the provider checks requests against what the client may ask for and what the user or administrator granted. The audience claim in the token names the intended API. Scopes may be coarse or tied to resource and action. The resource server must check both audience and scope on each call. It is hard to get right: naming is inconsistent, scopes proliferate, and many APIs accept any valid token from the provider regardless of audience.",
    k: ["Coarse scopes vs fine-grained scopes: coarse ones are easy to explain in consent, while fine-grained ones limit damage but become unmanageable and overflow token size.", "Scopes for capability and a separate policy engine for resource decisions vs scopes only: the engine decides per object, while scopes only fit broad access."],
    p: ["Resource servers that ignore the audience accept a token minted for a less sensitive API.", "Granting the union of scopes ever requested lets a client's access grow without any new consent."],
    v: "Request a token for one API and call a second API with it, confirming the second refuses it for audience, and request a scope beyond the grant and confirm it is dropped or refused.",
    dep: ["client-registry","consent-screens"]
  },
  "token-lifetimes": {
    s: "The durations after which each token type expires, which set the balance between user convenience, load on the provider and exposure of a stolen token.",
    d: "Typical settings are minutes for access tokens, an hour or less for identity tokens, a session-bound or days-to-weeks window for refresh tokens, and under a minute for codes. They are set per tenant and client and may be shortened for sensitive scopes. Clock skew between systems forces small tolerances. The decision is a trade: short lifetimes bound damage but increase refresh traffic and make the provider's availability visible to every user.",
    k: ["Short access tokens with rotation vs long access tokens: short ones limit exposure after theft, but require reliable refresh and put more load on the token endpoint.", "Session-bound refresh lifetime vs fixed lifetime: session-bound ties access to a live sign-in, while fixed is predictable for offline-capable applications."],
    p: ["Expiry checks without any skew tolerance reject valid tokens whenever two servers' clocks drift.", "Long lifetimes configured for a convenience demo remain in production for years."],
    v: "Issue each token type, wait past its expiry plus tolerance, and confirm every one is refused, while a token just inside its lifetime is accepted.",
    dep: ["tenant-configuration","session-lifetime-policy"]
  },
  "token-exchange": {
    s: "A grant that trades one token for another with a different audience, scope or subject, used for delegation between services and for acting on behalf of a user.",
    d: "A service holding a user's token presents it with its own credentials and asks for a token for a downstream API. The provider checks that the service may act for that subject and target, and issues a narrower token, often including an actor claim to record the chain. It keeps user context across service hops without passing the original token everywhere. The risk is chains of authority: each exchange must narrow rather than widen access, and long chains obscure responsibility.",
    k: ["Exchange per hop vs forwarding the original token: exchange limits scope and audience at each hop, but adds provider calls on the request path.", "Impersonation vs delegation with an actor claim: impersonation is simpler for downstream code, while delegation preserves who is really calling for audit."],
    p: ["Allowing an exchange to request broader scopes than the input token turns it into privilege escalation.", "Exchanges without an actor record make it impossible to tell who acted during an investigation."],
    v: "Exchange a user token for a downstream audience, confirm the result carries the user as subject and the service as actor with fewer scopes, then request more scopes than the input and confirm refusal.",
    dep: ["token-endpoint","scopes-and-audiences","workload-credentials","access-token-formats"]
  },
  "sender-constrained-tokens": {
    s: "Tokens bound to a key or certificate held by the client, so a stolen token is useless without the matching private key.",
    d: "The client proves possession at issuance, by a signed proof on each request or by a client certificate on the connection, and the provider embeds a thumbprint of the key in the token. Resource servers check that each call is signed with the same key or presented on the same certificate. This turns bearer tokens into proof-of-possession tokens. It is hard in practice: clients need key storage, proofs must be fresh and unique to prevent replay, and intermediaries that terminate connections break certificate binding.",
    k: ["Per-request signed proofs vs mutual TLS binding: signed proofs work through proxies, but cost computation and replay tracking, while mutual TLS is efficient and fragile behind intermediaries.", "Binding all tokens vs only high-value ones: binding everything is uniform, but excludes simple clients and raises operational cost."],
    p: ["Accepting a proof without a nonce or recent timestamp allows a captured proof to be replayed.", "A proxy that terminates TLS strips the certificate and makes every bound token fail."],
    v: "Obtain a bound token, call an API with the correct key proof and succeed, then replay the same token with a different key and with no proof and confirm both are refused.",
    dep: ["token-endpoint","access-token-formats","workload-credentials"]
  },
  "signing-key-store": {
    s: "Holds the private keys the provider uses to sign tokens, along with metadata about each key's identifier, algorithm, state and validity period.",
    d: "Keys are generated inside protected storage or a hardware module and never leave it in clear. Each has an identifier placed in token headers, an algorithm, a state such as pending, active or retired, and a validity period. The signing path asks the store to sign a given payload. Per-tenant keys isolate customers. It is the root of trust: someone who steals a signing key can mint valid tokens for any user in the scope of that key without touching the directory.",
    k: ["Per-tenant keys vs one shared key set: per-tenant limits the damage of compromise and allows tenant rotation, but multiplies keys to publish and rotate.", "Asking a hardware module to sign each token vs keeping keys in application memory: the module protects the key from theft, but limits signing rate and adds latency."],
    p: ["Keys that are exported for convenience to a configuration file or backup undo the protection of the hardware.", "Using the same key for tokens, assertions and encryption lets a flaw in one use compromise the others."],
    v: "Attempt to read a private key through the store's administrative interface and confirm it is refused, and confirm a freshly issued token verifies against exactly one published key identified by its header.",
    dep: ["hardware-key-protection","tenant-isolation"]
  },
  "key-rotation": {
    s: "Scheduled replacement of signing keys with an overlap, so new tokens use a new key while tokens signed by the old key remain verifiable until they expire.",
    d: "A new key is generated and published in the key set first, so verifiers can cache it; later it becomes the signing key; the old key stays published until all tokens it signed have expired, then is removed. Rotation runs on a schedule, such as every few months, and on demand after an incident. Timing depends on verifiers' cache durations and on token lifetimes. It is hard because failure is silent and delayed: a verifier that cached too long rejects every new token at the moment of switch.",
    k: ["Publishing the next key before it signs vs switching immediately: advance publication avoids cache misses, but means an extra key sits in the set.", "Frequent automatic rotation vs rare manual rotation: frequent rotation limits exposure and exercises the process, while rare rotation leaves the procedure untested until an emergency."],
    p: ["Removing the old key as soon as signing moves rejects every token still in flight.", "A rotation procedure never exercised is found broken during an actual compromise."],
    v: "Rotate in a test tenant and confirm tokens signed by the old key still verify during the overlap, new tokens carry the new key identifier, and the old key disappears after the longest token lifetime.",
    dep: ["signing-key-store","jwks-publishing","token-lifetimes"]
  },
  "jwks-publishing": {
    s: "A public endpoint serving the current public keys, identified by key identifier, so verifiers can check token signatures without contacting the provider each time.",
    d: "The key set lists the active and recently retired public keys with identifiers, algorithms and usage. Verifiers fetch and cache it, and refetch when they meet an unknown key identifier. The provider sets cache headers and serves from a highly available edge. Because every verification depends on this document, it must be authentic, available and consistent across regions. The common failure is in the verifiers: no refetch on unknown identifier, or refetching on every unknown value, which attackers use to flood the endpoint.",
    k: ["Long cache lifetimes vs short ones: long lifetimes protect the provider and survive outages, but delay a removal after compromise.", "Refetch on unknown key identifier vs fixed refresh interval: refetch handles rotation gracefully, but needs rate limiting so forged identifiers cannot drive load."],
    p: ["Verifiers that fetch keys from an address named in the token header can be pointed at an attacker's key set.", "Regional endpoints that update at different times serve different sets and cause intermittent failures."],
    v: "Fetch the key set from each region and confirm the same identifiers, then present a token with an unknown key identifier to a test verifier and confirm one rate-limited refetch followed by rejection.",
    dep: ["signing-key-store","cache-layer"]
  },
  "hardware-key-protection": {
    s: "Dedicated tamper-resistant hardware or a managed equivalent that generates and uses keys without ever exposing them to the host operating system or administrators.",
    d: "The signing service sends payloads to the hardware module, which signs with a key marked non-exportable and returns the signature. Access to the module is authenticated and limited to the signing service, with operations logged. Key ceremonies define who may create, back up and restore keys, often needing several people. The module has throughput and availability limits, so clusters and caching of signing decisions are used. It is hard operationally: backup and disaster recovery of keys that cannot be exported need careful design.",
    k: ["Hardware module vs software keys with strict access: hardware resists theft even by a root intruder, but costs more and limits throughput, while software is flexible and easier to compromise.", "Quorum-controlled backup vs no backup: backup survives a loss of the module, but creates a copy whose custody must be secured."],
    p: ["Losing the only module with no backup makes every previous token unverifiable and requires a full re-keying.", "A signing service allowed to ask for any operation lets an attacker with the service sign anything."],
    v: "Request signatures through the service's normal path and confirm success, attempt to export the key and confirm refusal, and confirm each signing call appears in the module's own log.",
    dep: []
  },
  "key-compromise-recovery": {
    s: "The procedure for the case where a signing key may have leaked: revoke it, rotate immediately, invalidate affected tokens and sessions, and notify relying parties.",
    d: "The plan names who can declare an incident, how a new key is generated and published immediately, how the old key is removed from the key set, and how clients are forced to re-authenticate. Tokens signed by the old key are invalid from the moment it is removed, which logs out everyone, so the plan covers capacity for the re-login surge. Verifiers that cache keys must be told to refresh. It is hard because it must be rehearsed: the first time it runs should not be during an attack.",
    k: ["Immediate removal of the old key vs graceful overlap: removal ends forged-token risk at once, but forces every user and service to authenticate again.", "Central purge of verifier caches vs waiting for expiry: a purge shortens the window, but only reaches verifiers the provider knows about."],
    p: ["A key kept in the set for convenience after a suspected leak keeps accepting attacker tokens.", "No capacity plan for mass re-login turns the recovery into an outage."],
    v: "Run a drill in staging: declare a compromise, remove the key, and measure time until forged tokens are rejected everywhere, time to restore normal sign-in volume, and confirm all steps are in the runbook.",
    dep: ["key-rotation","jwks-publishing","session-store","token-revocation"]
  }
});
