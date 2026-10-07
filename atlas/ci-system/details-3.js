// Details for the continuous integration plate, part 3: runners, isolation, secrets.
ATLAS.details("ci-system", {
  "runner-agent": {
    s: "The long-running or per-job process on a build machine that registers with the control plane, takes jobs, runs them, streams output and reports the result.",
    d: "On start it authenticates with a registration credential, advertises its labels and capacity, and begins asking for work. For each job it prepares the environment through an executor, fetches source, runs the steps in order, uploads logs and artifacts, sends heartbeats and reports a final status. It must also obey cancel and timeout instructions from the control plane. It is hard because it is the one component that executes arbitrary code on a machine with credentials to the control plane, and it must keep reporting honestly even when the job is hostile or the machine is failing.",
    k: ["Persistent runner serving many jobs versus single-use runner: persistent is fast and accumulates state between jobs; single-use is clean and pays startup time per job.", "Runner holds a long-lived registration credential versus gets a per-job token: long-lived is simple and valuable to steal; per-job tokens limit damage and need a minting step."],
    p: ["A runner that keeps polling after its machine is half dead takes jobs it cannot finish.", "Version skew between runner and control plane causes jobs to fail with confusing protocol errors after an upgrade."],
    v: "Start a runner, confirm it appears with its labels in the control plane, run a job that prints and exits nonzero, and confirm the log, the exit status and a failed job state all arrive and the runner returns to idle.",
    dep: ["job-polling-protocol", "container-executor", "shell-executor"]
  },
  "job-polling-protocol": {
    s: "The wire protocol by which runners ask the control plane for work and report back: authentication, long polling, leases, heartbeats and result submission.",
    d: "A runner opens an authenticated request to ask for a job matching its capabilities. The server holds the request until work is available or a timeout expires, then returns a job payload with variables, a short-lived token, steps and a lease. While running, the runner sends heartbeats, log chunks and status updates, and ends with a result. Because runners initiate every connection, they work behind firewalls with no inbound access. The hard part is failure handling: lost responses, duplicate submissions and server restarts must not lose or duplicate work.",
    k: ["Long polling versus a persistent stream: long polling is simple and works through any proxy; streams push faster and need connection management and fall-back.", "Idempotent result submission with an attempt id versus trusting one call: idempotency tolerates retries and needs ids everywhere; a single call is simple and breaks on a lost response."],
    p: ["Thousands of runners polling with a short interval overload the control plane after an outage, as they all retry together.", "A job payload containing secrets logged by an intermediate proxy leaks them."],
    v: "Restart the control plane while a runner holds a job and confirm the runner retries with backoff, resubmits the result with the same attempt id, and exactly one terminal state is recorded.",
    dep: ["control-plane-api", "job-queue"]
  },
  "shell-executor": {
    s: "Runs job steps directly on the host as a local user, with no container or virtual machine, trading separation for speed and access to host tools and hardware.",
    d: "The runner creates a working directory, checks out source and spawns a shell for each step under a dedicated unprivileged account. It can use anything installed on the host: compilers, device drivers, attached test devices, licensed software. It is common for build farms, hardware-in-the-loop tests and platforms without good containers. Everything that makes it fast also makes it dangerous and unreliable: jobs share the machine, leave files and processes behind, and can alter the toolchain for the next job.",
    k: ["Direct host execution versus containers: direct gives full hardware access and zero start-up cost, with no separation and drift between jobs; containers give clean, repeatable environments.", "Reuse the working directory across jobs versus a fresh one: reuse makes incremental builds fast and leaks state; fresh is correct and slower."],
    p: ["A job that leaves a background process running interferes with the next job on the same host.", "A global install by one job changes a tool version, making a later unrelated job fail."],
    v: "Run a job that starts a background process and writes outside its directory, then run a second job and confirm the cleanup step removed the process and files, so the second sees a clean machine.",
    dep: ["runner-agent", "workspace-cleanup"]
  },
  "container-executor": {
    s: "Runs each job inside a container created from a specified image, giving a repeatable toolchain and light separation, with optional service containers alongside.",
    d: "For each job the executor pulls an image, starts a container with the workspace mounted, and runs steps inside it. Additional service containers, such as a database for integration tests, are started on a private network. Images pin the toolchain, so a run is repeatable across machines. Starting is fast, but containers share the host kernel, so they are weaker isolation than virtual machines. Building container images inside jobs needs special handling, since it normally requires privileges that would let the job escape.",
    k: ["Containers versus virtual machines: containers start in seconds and share a kernel, so a kernel flaw crosses jobs; virtual machines cost more and give a harder boundary.", "Build images with a privileged daemon versus rootless or daemonless builders: privileged builds are compatible and give the job host control; rootless builders are safer and have gaps in compatibility."],
    p: ["Mounting the host's container socket into a job gives it control of every other container on the machine.", "A mutable image tag silently changes the toolchain between two runs of the same revision."],
    v: "Run the same job on two different hosts and confirm the toolchain digest reported inside the container is identical, and that a service container on the job network is reachable by name but not from outside.",
    dep: ["runner-agent", "runner-image-management", "sandbox-boundary"]
  },
  "vm-executor": {
    s: "Boots a fresh virtual machine per job, giving a full operating system, its own kernel and a strong boundary at the cost of slower start and more resource use.",
    d: "The executor requests a virtual machine from a hypervisor or cloud provider using a prepared image, waits for the guest to start, runs the job through an agent inside, then destroys the machine and its disk. It supports workloads containers cannot: kernel features, other operating systems, nested virtualization, privileged system tests. It is the usual choice for untrusted code. Start-up time of tens of seconds to minutes is the main problem, which warm pools and snapshots reduce but do not remove.",
    k: ["Fresh virtual machine per job versus reused: fresh gives a clean state and a hard boundary; reuse cuts start time and brings back cross-job contamination.", "Boot from a full image versus restore a memory snapshot: snapshots start in a second and carry stale state and entropy; full boot is slower and starts cleanly."],
    p: ["A snapshot restored with a stale clock or duplicated random state produces repeated tokens or certificate failures.", "A provider outage on machine creation stalls the entire queue with no fallback pool."],
    v: "Run a job that writes a marker file in the guest, then run another job and confirm it starts from the pristine image with no marker, and that the first machine and disk are gone from the provider's list.",
    dep: ["runner-agent", "runner-image-management", "warm-pools"]
  },
  "ephemeral-runner-lifecycle": {
    s: "The create, register, run once, tear down cycle of single-use runners, which makes every job start from a known state and removes the registration afterward.",
    d: "The autoscaler or provisioner creates a machine or container, injects a one-time registration token, and the runner registers, takes exactly one job and exits. The control plane deregisters it and the infrastructure deletes it. Nothing survives to the next job: workspaces, credentials, processes and caches on the machine all disappear. This is the strongest defense against cross-job contamination. It is demanding: every job pays registration and setup time, and the provisioner must clean up runners that never started or failed to exit.",
    k: ["Single-use runners versus long-lived pooled runners: single-use removes persistence an attacker could abuse and costs setup latency every job; pooled is fast and carries over state.", "One-time registration tokens versus a shared token baked into the image: one-time tokens limit what a stolen image can do; a shared token is simpler and long-lived."],
    p: ["Orphaned machines whose runner never registered keep running and billing until a reaper finds them.", "A job that never ends keeps its single-use machine indefinitely, since nobody else will take it."],
    v: "Run one hundred jobs and confirm one hundred distinct runner instances were created and destroyed, none appears in the runner list afterward, and the provider shows no leftover machines after ten minutes.",
    dep: ["runner-agent", "queue-depth-autoscaler", "workspace-cleanup"]
  },
  "runner-image-management": {
    s: "Builds, tests, versions and distributes the base images that runners and containers start from, so toolchains are known, patched and identical across the fleet.",
    d: "Images are built by their own pipeline from declarative recipes, scanned, tested with a smoke job and published with an immutable version. Pools reference a version, and rollout of a new one is staged. Many teams maintain a small set of general images plus specialized ones. It is hard because images bundle hundreds of tools: every update risks breaking someone, security patches must still arrive quickly, and large images slow every cold start unless they are layered and cached on hosts.",
    k: ["One large general image versus many small specialized images: a large image is convenient and slow to pull and full of unrelated tools; small images are fast and multiply maintenance.", "Pin by version with scheduled updates versus track latest: pinning keeps runs stable and delays patches; latest brings fixes and surprise failures."],
    p: ["Replacing a tool version inside a widely used image breaks hundreds of repositories at once.", "An image never rebuilt accumulates known vulnerabilities in every build."],
    v: "Publish a new image version, route one pool to it, and confirm jobs on that pool report the new toolchain digests while others keep the old, and that a failed smoke job blocks publication.",
    dep: ["artifact-upload", "build-provenance"]
  },
  "specialized-hardware-pools": {
    s: "Separate runner pools for machines with unusual requirements: other CPU architectures, graphics processors, large memory, attached devices or operating systems that cannot be virtualized.",
    d: "Pools are defined by capability and exposed through labels. Jobs target them explicitly. Some are autoscaled from a cloud, others are fixed physical racks, such as phones attached to hosts or boards with a debug probe. Capacity is scarce and costly, so these pools have tight quotas and queue discipline. They are hard to operate: physical devices fail, need resetting between runs, and cannot be created on demand, so jobs must be able to wait or fail gracefully when none is available.",
    k: ["Elastic cloud pools versus owned hardware: cloud scales and costs more per hour and cannot provide every device; owned is cheap per job and needs maintenance and has fixed capacity.", "Dedicated pool per team versus shared pool: dedicated gives guaranteed access and idle waste; shared pools use hardware better and need quotas."],
    p: ["A device left in a bad state by one job fails the next job and is misread as a code regression.", "A pool with one machine makes its failure a total outage of that test category."],
    v: "Submit a job requiring an attached device, confirm it lands on a host with that device present, and after it ends confirm the host resets the device and passes a health check before taking the next job.",
    dep: ["runner-matching", "fleet-health-and-drain"]
  },
  "trust-tiers": {
    s: "Classifies code and the people who wrote it into levels, such as protected branch, internal change and external fork, and ties what each level may use to that class.",
    d: "Each run gets a trust level from its source: a protected branch of the repository, a branch in the repository, a fork by a known member, a fork by a stranger. The level determines which runners it can use, which secrets it can read, whether the network is open, whether caches may be written and whether approval is needed first. It is the policy that connects most other controls in this group. The difficulty is defining the boundary and sticking to it: an exception for convenience, such as sharing a cache between tiers, can undo the whole design.",
    k: ["Separate runner pools per tier versus one pool with software separation: separate pools give a hard boundary and cost idle capacity; shared pools use machines well and depend on cleanup being perfect.", "Trust the author versus trust the code path: author-based trust is easy to evaluate and fails after account takeover; path-based rules are harder and sturdier."],
    p: ["Treating anyone with write access as fully trusted lets a compromised contributor account reach production secrets.", "A cache shared across tiers lets an untrusted run poison what a trusted run later restores."],
    v: "Run an identical job as a protected branch, an internal branch and a fork, and confirm the runner pool, visible secrets, cache write permission and network access differ exactly as the written policy states.",
    dep: ["sandbox-boundary", "secret-scoping", "cache-scoping-and-trust", "runner-matching"]
  },
  "sandbox-boundary": {
    s: "The mechanism that confines a job: namespaces, a virtual machine, or a user-space kernel, which defines what a hostile job can see and touch on its host.",
    d: "Whatever the executor, a boundary decides which files, processes, devices, network paths and kernel interfaces a job can reach. Options range from separate user accounts, through containers with restricted system calls and capabilities, to user-space kernels and full virtual machines. The stronger the boundary the more its overhead and the fewer workloads it supports. The central difficulty is that CI jobs legitimately need things sandboxes dislike: building container images, mounting filesystems, running debuggers and loading kernel modules.",
    k: ["Kernel-shared sandbox versus hardware-virtualized boundary: shared kernel is light and exposed to kernel flaws; hardware virtualization is stronger, slower to start and heavier.", "Allow privileged jobs on a dedicated pool versus grant the privilege broadly: dedicated pools confine the risk and fragment capacity; broad privilege is convenient and removes the boundary."],
    p: ["A privileged flag added to make one build work removes the sandbox for every step of that job.", "Host paths mounted for caching give the job a way to write outside its workspace."],
    v: "From inside a job, attempt to read the host's process list, a neighbor job's workspace and a host device, and confirm each attempt fails; then confirm the same attempt succeeds only in the explicitly privileged pool.",
    dep: ["container-executor", "vm-executor"]
  },
  "network-egress-policy": {
    s: "Controls where a job can connect: which registries and services it may reach, whether it can contact the internet at all, and how internal systems are protected from it.",
    d: "Jobs normally need package registries, the code host and artifact storage, but not arbitrary hosts or internal services. Policy is enforced by network rules, a forward proxy with an allow list, or a mirror inside the network. Closed networks after dependency fetch stop exfiltration and make builds more hermetic. Metadata services of the cloud platform, which hand out machine credentials, must be unreachable from jobs. It is hard because dependencies are numerous and change, so allow lists need upkeep and break builds when a new host appears.",
    k: ["Allow list of destinations versus open egress with monitoring: allow lists block exfiltration and break builds when dependencies move; open egress is easy and relies on detection after the fact.", "Fetch dependencies in one open phase, then run offline versus keep the network up throughout: two phases reduce risk and require restructuring builds; always-on is simple."],
    p: ["A job reaching the cloud metadata address can obtain the machine's own credentials.", "Egress rules that permit a broad content network allow data to be pushed to any account there."],
    v: "From a job, request the cloud metadata address, an internal admin service and an unlisted external host, and confirm all three fail while the package mirror and code host succeed.",
    dep: ["sandbox-boundary", "dependency-cache"]
  },
  "resource-limits": {
    s: "Hard caps on the CPU, memory, disk, process count and network bandwidth a job may consume, so one job cannot starve neighbors or crash the host.",
    d: "Limits are applied through the executor: control groups for containers, allocation for virtual machines, quotas for disks. Memory limits trigger out-of-memory kills of the job, and the runner must report that clearly. Fixed sizes make capacity predictable; requested sizes are used by the scheduler to pack jobs. Limits are hard to set: too tight and a compile fails on a random Tuesday, too loose and a fork bomb takes down the machine. Disk is the usual casualty, since caches and artifacts grow until the host fills.",
    k: ["Strict limits with kill versus soft limits with throttling: strict kills protect neighbors and produce failures that look like flakiness; throttling slows everything and keeps jobs alive.", "Declared per-job sizes versus fixed runner sizes: declared sizes pack well and need accurate estimates; fixed sizes are simple and waste capacity for small jobs."],
    p: ["An out-of-memory kill reported as a generic failure sends authors looking for a bug in the code.", "A full disk on a shared host fails unrelated jobs with strange write errors."],
    v: "Run a job that allocates memory beyond its limit and another that fills the disk, and confirm each is killed with a message naming the exhausted resource while a concurrent neighbor job finishes normally.",
    dep: ["container-executor", "runner-agent"]
  },
  "privileged-job-controls": {
    s: "Extra restrictions for jobs that hold powerful rights, such as deploying or publishing: restricted runners, approvals, protected branches only and short-lived access.",
    d: "Jobs that deploy, sign or publish are the most valuable targets. They are limited to protected branches, run on dedicated hardened runners, require an approval and receive their credentials only at that step. The definition of the privileged job is separated from untrusted editing, for example via a template the repository cannot override. The aim is that no change can reach the secrets without review by someone responsible. The hard part is keeping the privileged path narrow while the team still ships quickly.",
    k: ["Separate privileged pipeline versus privileged stage in one pipeline: separate pipelines keep untrusted and trusted code apart and add handoff plumbing; a stage in one pipeline is simpler and shares more state.", "Human approval for each deploy versus automatic after checks: approval catches judgment errors and slows releases; automation is fast and depends fully on the checks."],
    p: ["A deploy job whose script lives in the same repository can be changed by the same change that triggers it.", "A runner reused between privileged and ordinary jobs can leave a credential for the next job to read."],
    v: "Attempt to run the deploy job from an unprotected branch and from a branch that edits its script, and confirm both are refused, while the protected branch run requires an approval and uses the dedicated runner.",
    dep: ["protected-environments", "trust-tiers", "ephemeral-runner-lifecycle"]
  },
  "workspace-cleanup": {
    s: "Removes everything a job left behind, files, processes, mounts, temporary credentials and network state, so the next job starts clean and nothing leaks across jobs.",
    d: "On reused hosts, cleanup runs after every job: it kills remaining processes, unmounts, deletes the workspace and temp directories, removes job-scoped credentials and trims caches and images to quota. On single-use machines the destroy step replaces it. Even the checkout can retain files from a previous revision unless it is forced clean. It is hard to be complete: processes that escaped the job's group, files owned by other users, and files held open resist deletion, and cleanup that silently fails leaves poison for later jobs.",
    k: ["Delete everything versus keep a warm checkout: full deletion is safe and slow on large repositories; a warm checkout speeds fetch and risks stale files affecting results.", "Best-effort cleanup versus fail and quarantine the host on error: best-effort keeps capacity up and hides contamination; quarantine is safe and removes machines from service."],
    p: ["Untracked build products from an earlier revision make a test pass that fails on a clean checkout.", "A cleanup failure that is logged and ignored lets a credential file persist for the next tenant."],
    v: "Run a job that plants a file, a process and a credential file, then run a following job on the same host and confirm none exist, or that the host was removed from service after a failed cleanup.",
    dep: ["runner-agent"]
  },
  "dependency-pinning": {
    s: "Fixes third-party dependencies, base images and reusable pipeline steps to exact versions or content hashes, so builds do not change when something upstream does.",
    d: "Lock files record exact versions and checksums for libraries; image references use digests; reusable steps are referenced by commit rather than a movable tag. Updates arrive as reviewed changes from automated tooling. This protects against upstream compromise, unannounced releases and builds that differ between two runs. Verification must be enforced: the build fails if a checksum does not match or a lock file would change. The trade is maintenance: pins go stale, and teams that never update carry known vulnerabilities.",
    k: ["Pin by content hash versus by version number: hashes cannot be silently replaced and are unreadable; version tags are legible and can be repointed by the publisher.", "Automated update proposals versus manual bumps: automation keeps pins fresh and creates review load; manual bumps are rare and fall far behind."],
    p: ["Referencing a reusable pipeline step by a movable tag lets its owner, or an attacker who takes the account, change what runs in your pipeline.", "A lock file that the build is allowed to rewrite offers no protection."],
    v: "Alter one byte of a pinned dependency in the mirror and confirm the build fails with a checksum mismatch rather than using it, and confirm a step referenced by tag is flagged by the validator.",
    dep: ["config-validation", "dependency-cache"]
  },
  "build-provenance": {
    s: "Records and signs how an artifact was built, from which revision, by which pipeline on which runner, so consumers can verify it before they trust it.",
    d: "At the end of a build, a trusted component produces a statement listing the source revision, the pipeline definition, the builder identity, the inputs and the output digests, and signs it with a key the build job itself cannot read. Deployers verify the signature and check the statement against policy before accepting an artifact. This ties a binary to a reviewed change. It is hard to get meaningful: if the job being attested can forge its own statement, it proves nothing, so the signer must be separate from the build steps.",
    k: ["Signed by the platform outside the job versus by the job: platform signing is trustworthy and needs deep integration; job signing is easy and can be forged by the code it describes.", "Keyless short-lived signing identities versus managed long-lived keys: keyless removes key storage and depends on an identity provider; long-lived keys are self-contained and a target."],
    p: ["Provenance generated by a build step the pull request can edit attests to whatever the attacker wants.", "Verification skipped at deploy time means signed statements are written and never read."],
    v: "Download a released artifact, verify its signature and statement, confirm the revision and builder match the run, then change one byte and confirm verification fails.",
    dep: ["workload-identity-tokens", "artifact-upload", "object-store"]
  },
  "secret-store": {
    s: "The encrypted storage for credentials that pipelines use, with access control, versioning and delivery to jobs at run time, kept apart from the repository.",
    d: "Secrets are stored encrypted, either in the CI system's own store or in an external secrets manager that CI queries when a job starts. They are delivered through environment variables or files, only to jobs allowed to receive them, and are never returned in cleartext through the interface after creation. Rotation, auditing of each read and revocation are part of the job. The hard part is that any code running in a job can read what the job can read, so storage is easy and delivery policy is where the risk lives.",
    k: ["Built-in store versus external secrets manager: built-in is simple and ties secrets to the CI system; external centralizes rotation and audit and adds a dependency and its credentials.", "Inject at job start versus fetch on demand within the job: injection is simple and exposes everything for the whole job; fetching on demand narrows exposure and needs the job to authenticate."],
    p: ["A secret passed as an environment variable appears in a crash dump or process listing.", "A secret that cannot be rotated without editing every pipeline tends never to be rotated."],
    v: "Create a secret, confirm the interface never displays it again, run an allowed job that uses it and a disallowed one that cannot, and confirm the audit log records each read with the job identity.",
    dep: ["access-control", "audit-log"]
  },
  "secret-scoping": {
    s: "Restricts each secret to the projects, branches, environments and job types that need it, so a compromised or unreviewed job sees little.",
    d: "A secret is declared at organization, group, project or environment level, with extra conditions such as available only to protected branches or only to jobs in a named environment. Runs from forks and unreviewed branches receive none. Scoping works with trust tiers: it is the enforcement point for what each tier may read. It is hard because broad secrets are convenient and the number of scopes grows, so teams end up with one organization-wide token and no practical way to tell who uses it.",
    k: ["Narrow environment-level secrets versus shared organization secrets: narrow limits blast radius and multiplies secrets to rotate; shared is easy to manage and one leak exposes everything.", "Condition on branch protection versus on job name: branch protection depends on a reviewed process; job names can be set by whoever edits the file."],
    p: ["A secret scoped to all branches is readable by a pull request that prints it.", "An organization-wide secret copied into a project to unblock someone is never removed."],
    v: "Run the same job from a protected and an unprotected branch and confirm only the protected run has the variable, and that the unprotected run shows it as absent rather than empty.",
    dep: ["secret-store", "trust-tiers"]
  },
  "workload-identity-tokens": {
    s: "Short-lived signed tokens that prove which pipeline, repository and branch a job belongs to, letting cloud services grant access without any stored long-term secret.",
    d: "The CI system acts as an identity provider. For each job it issues a signed token carrying claims such as repository, branch, environment and run id, valid for minutes. A cloud or secrets service is configured to trust that provider and to map claim values to roles. The job presents the token and receives temporary credentials. It removes standing secrets from CI. The difficulty is writing the trust rules tightly: a rule that matches only the repository, not the branch or environment, grants production access to any branch.",
    k: ["Token exchange with claims versus stored long-lived keys: exchange eliminates stored secrets and requires careful trust rules in every target; stored keys are simple and leak permanently.", "Short token lifetime versus long: short limits misuse and breaks long jobs unless re-minted; long is convenient and widens the window."],
    p: ["A trust rule that matches only the organization lets any repository in it assume the production role.", "Claims containing the branch name are trusted without checking whether the branch is protected."],
    v: "Request cloud credentials from a job on the default branch and from a feature branch and confirm only the first receives the deploy role, and the token expires on schedule.",
    dep: ["control-plane-api", "access-control"]
  },
  "job-token-permissions": {
    s: "The automatically issued credential a job uses to call the code host and CI system, scoped to the least rights the job needs and valid only while it runs.",
    d: "For each job the control plane mints a token tied to the run, with permissions such as read repository, write packages or none. It lets jobs fetch source, upload artifacts and call other pipelines without a stored credential. Defaults should be read-only, with each pipeline declaring more where needed, and runs from untrusted tiers get less. The hazard is generosity: a token that can write to the repository, issues and other projects makes every job a possible attacker of all of them.",
    k: ["Read-only default with explicit grants versus broad default: restrictive defaults limit damage and need authors to ask; broad defaults make pipelines work first time and expose more.", "Cross-project access by allow list on the target versus open to the whole organization: allow lists are explicit and require setup; open access is easy and unbounded."],
    p: ["A token with write access to contents lets a job push to the branch it is testing.", "Token valid beyond job end remains in logs or artifacts, usable after the run."],
    v: "From a job, attempt to push a commit and to read another private project with the job token and confirm both are refused, then grant one permission and confirm only that action begins to work.",
    dep: ["forge-app-identity", "access-control"]
  },
  "log-masking": {
    s: "Detects known secret values in job output and replaces them with placeholders before the text is stored or shown, as a last defense against leaks.",
    d: "The runner knows the values of the secrets delivered to a job and scans output streams for exact matches, replacing them as they pass. Some systems also match patterns for common token formats. Masking is applied before logs leave the runner. It is a safety net, not a guarantee: transformed secrets, such as base64 or split across lines, slip through, and secrets derived or fetched inside the job are unknown to the runner unless the job registers them. Masking cannot protect against a job that sends the secret elsewhere.",
    k: ["Exact-value masking versus pattern-based detection: exact matching has no false positives and misses encodings; patterns catch unknown secrets and mask innocent text.", "Mask at the runner versus at ingestion: runner masking keeps secrets from ever leaving the machine; ingestion masking is centralized and sees the cleartext in transit."],
    p: ["A secret printed one character per line or base64 encoded is stored unmasked.", "A short secret value, such as a one-digit flag, masks unrelated text across the log."],
    v: "Print a secret, its base64 form and a secret fetched at runtime in a test job and confirm the plain one is masked in the stored and live logs, and note which transformed forms still appear.",
    dep: ["secret-store", "log-streaming"]
  },
  "protected-environments": {
    s: "Named deployment targets such as staging and production with their own rules: who may deploy, required approvals, which branches may reach them and their own secrets.",
    d: "An environment object ties together a set of secrets, a list of allowed deployers or branches, required reviewers and optionally a wait timer. A job declares the environment it targets, and the control plane checks the rules before starting it and releases the secrets only then. Deployment history is recorded per environment. It is hard to keep coherent with the pipeline: environment rules are configured in the interface while pipelines live in code, so the two can drift, and an approval must refer to the exact revision approved.",
    k: ["Approval bound to the exact revision versus to the pipeline: binding to the revision is precise and requires re-approval after changes; binding to the pipeline is convenient and approves code nobody saw.", "Environment rules in code versus in the interface: in code they are reviewable and editable by the people they restrict; in the interface they are protected and invisible to review."],
    p: ["An approval granted for one revision remains valid when a later commit is pushed to the same run.", "Environment secrets available to any branch because the branch restriction was never set."],
    v: "Trigger a production deployment from a non-allowed branch and confirm refusal, then from an allowed branch and confirm it waits for the named approver, and the secrets appear only after approval.",
    dep: ["secret-scoping", "access-control", "audit-log"]
  },
});
