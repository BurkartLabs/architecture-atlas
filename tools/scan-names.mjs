// Second-line check for product, vendor and project names that tools/check-map.mjs does not list.
// node tools/scan-names.mjs <slug...>   (no slugs: every plate). Prints each hit with context; exits 1 if any.
// Hits need a human look: some are ordinary words ("Signal", "Matrix", "Express" at a sentence start).
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const NAMES = [
  // operating systems, kernels, filesystems, runtimes
  "seL4", "ext[234]", "btrfs", "Btrfs", "ZFS", "NTFS", "XFS", "APFS", "systemd", "launchd", "bash", "zsh", "tmux", "xterm",
  "gdb", "GDB", "lldb", "LLDB", "DTrace", "eBPF", "ELF", "DWARF", "Mach-O", "glibc", "musl", "Docker", "runc", "containerd",
  "Kubernetes", "kubelet", "etcd", "QEMU", "KVM", "Xen", "VMware", "Hyper-V", "VirtIO", "virtio", "GRUB", "coreboot",
  "U-Boot", "FreeRTOS", "Zephyr", "SGX", "TrustZone", "Wayland", "X11", "Xorg",
  // languages and toolchains
  "JVM", "Lua", "Ruby", "Perl", "Erlang", "BEAM", "HotSpot", "Emacs", "Vim", "Neovim", "Git", "Mercurial", "npm",
  "Cargo", "dpkg", "RPM", "Bazel", "Gradle", "Maven", "Starlark", "ANTLR", "yacc", "bison", "Prettier", "Babel",
  "Wasmtime", "Z3", "Coq", "Lean", "Isabelle", "Jupyter", "AFL", "libFuzzer", "KLEE", "PCRE", "Sphinx", "Doxygen",
  // web, data and infrastructure products
  "nginx", "Nginx", "Apache", "HAProxy", "Envoy", "Istio", "Linkerd", "Varnish", "Memcached", "Elasticsearch",
  "Lucene", "Solr", "OpenSearch", "RocksDB", "LevelDB", "Cassandra", "DynamoDB", "MongoDB", "RabbitMQ", "Pulsar",
  "NATS", "Flink", "Spark", "Hadoop", "Airflow", "Iceberg", "Snowflake", "BigQuery", "Redshift", "ClickHouse",
  "Neo4j", "Debezium", "Django", "Rails", "Laravel", "Spring", "Next\\.js", "Vue", "Angular", "Svelte", "GraphQL",
  "Selenium", "Playwright", "Puppeteer", "WordPress", "Contentful", "Prometheus", "PromQL", "Grafana", "Jaeger",
  "Zipkin", "OpenTelemetry", "InfluxDB", "Terraform", "Pulumi", "Ansible", "Puppet", "Chef", "Consul", "ZooKeeper",
  "Raft", "Paxos", "Akka", "Orleans", "Slurm", "gRPC", "Thrift", "Protobuf", "protobuf", "Maglev",
  "Bitcoin", "Ethereum", "Jenkins", "GitHub", "GitLab", "Bitbucket", "Gerrit", "Jira", "LaunchDarkly", "Sentry",
  "Postman", "JMeter", "Backstage", "Dependabot", "Snyk",
  // security
  "Vault", "Okta", "Auth0", "Keycloak", "OPA", "Rego", "Cedar", "Zanzibar", "SpiceDB", "Let's Encrypt", "ACME",
  "1Password", "Bitwarden", "LastPass", "KeePass", "Snort", "Suricata", "Zeek", "Splunk", "MITRE", "ATT&CK",
  "CrowdStrike", "Defender", "YARA", "VirusTotal", "Nessus", "Qualys", "BeyondCorp", "Sigstore", "cosign", "Rekor",
  "SLSA", "in-toto", "TUF", "Notary",
  // AI and ML
  "CUDA", "ROCm", "NCCL", "ONNX", "Triton", "TensorFlow", "PyTorch", "JAX", "XLA", "NumPy", "Python", "vLLM",
  "TensorRT", "LangChain", "LlamaIndex", "Hugging Face", "Feast", "MLflow", "Kubeflow", "Whisper", "Tesseract",
  "OpenCV", "Rasa", "Dialogflow", "Alexa", "Siri", "Waymo", "Tesla", "Apollo", "Autoware", "ChatGPT", "GPT-4",
  "Claude", "Gemini", "Llama",
  // networking, embedded, media and applications
  "DPDK", "BIND", "Unbound", "dnsmasq", "ISC", "WireGuard", "OpenVPN", "IPsec", "OpenFlow", "FRR", "Quagga",
  "iptables", "nftables", "pf", "Postfix", "Exim", "Sendmail", "Dovecot", "Thunderbird", "Outlook", "Asterisk",
  "FreeSWITCH", "Zoom", "Slack", "Discord", "BitTorrent", "ROS", "PX4", "ArduPilot", "AUTOSAR",
  "CODESYS", "Zigbee", "Z-Wave", "Verilog", "VHDL", "Vivado", "Quartus", "KiCad", "Altium", "cFS",
  "Blender", "Maya", "Houdini", "Nuke", "Arnold", "RenderMan", "Ableton", "Pro Tools", "Premiere", "DaVinci",
  "Twitch", "Spotify", "OpenXR", "HarfBuzz", "FreeType", "ImageMagick", "libvips", "OpenStreetMap", "OSRM",
  "SolidWorks", "Parasolid", "Shopify", "Magento", "Stripe", "Visa", "Mastercard", "SWIFT", "NASDAQ", "Square",
  "SAP", "Oracle", "Salesforce", "HubSpot", "Uber", "Lyft", "Twitter", "Facebook", "Instagram", "TikTok",
  "YouTube", "Notion", "Obsidian", "Moodle", "Canvas", "Epic", "Cerner", "HL7", "FHIR",
  // companies
  "Amazon", "AWS", "Azure", "GCP", "Netflix", "Meta", "Microsoft", "Google", "Apple", "NVIDIA", "Intel", "AMD", "Qualcomm",
];
const re = new RegExp(`\\b(${NAMES.join("|")})\\b`, "g");
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, "atlas"));
let hits = 0;
for (const slug of slugs) {
  const dir = path.join(root, "atlas", slug);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => /^(data|details.*)\.js$/.test(f))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(re)) {
      // ids are kebab-case and never shown; skip matches inside them
      const before = text.slice(Math.max(0, m.index - 40), m.index), after = text.slice(m.index, m.index + 50);
      if (/[a-z0-9]-$/.test(before) || /^[A-Za-z0-9]+-[a-z0-9]/.test(after) && /"[a-z0-9-]*$/.test(before)) continue;
      hits++;
      console.log(`${slug}/${f}: …${before.replace(/\s+/g, " ")}[${m[0]}]${after.slice(m[0].length).replace(/\s+/g, " ")}…`);
    }
  }
}
console.log(`${hits} hit(s) in ${slugs.length} plate(s)`);
process.exit(hits ? 1 : 0);
