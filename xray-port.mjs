// HOSINO-LINKPORT v1：线路卡片的 xray 端口不再写死 8443。
// 优先从 ss -lntp 里找 xray 进程自己的 TCP LISTEN 端口（必须能看到进程名/pid）。
// /proc/<pid>/net/tcp 是整个网络命名空间的表，会把 nginx:80 也算进去，不能用。
// ubuntu 通常看不到别人的进程名，配置也未必可读，这时用 HOSINO_XRAY_PORT，再回退 2087。
// 不要把 hysteria 的 UDP 8443 当成 xray。

export const DEFAULT_XRAY_PORT = 2087;
const WG_PORTS = [51820, 51821];

export function parseEnvPort(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

function isXrayName(name) {
  const base = String(name || "").split("/").pop();
  return base === "xray";
}

export function isXrayCmdline(cmd) {
  const parts = String(cmd || "").split("\0").filter(Boolean);
  return isXrayName(parts[0] || "");
}

export function parseSsLine(line) {
  const s = String(line || "").trim();
  if (!s || s.startsWith("Netid") || s.startsWith("State")) return null;
  const protoM = /^(tcp|udp)\b/i.exec(s);
  const proto = protoM ? protoM[1].toLowerCase() : null;
  const rest = proto ? s.slice(protoM[0].length).trim() : s;
  const m = rest.match(/^(LISTEN|UNCONN|ESTAB|TIME-WAIT|FIN-WAIT-\d|SYN-RECV|SYN-SENT|LAST-ACK|CLOSING|CLOSE-WAIT|CLOSE)\s+\d+\s+\d+\s+(\S+)\s+(\S+)(?:\s+users:\((.*)\))?$/i);
  if (!m) return null;
  const local = m[2], peer = m[3];
  const port = parseEnvPort((local.match(/:(\d+)$/) || [])[1]);
  if (!port) return null;
  const host = local.slice(0, local.lastIndexOf(":"));
  const loopback = isLoopbackHost(host);
  return { proto: proto || "tcp", state: m[1].toUpperCase(), port, local, peer, host, loopback, users: m[4] || "" };
}

function isLoopbackHost(host) {
  const h = String(host || "").replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "::1" || h === "localhost" || /^127\.\d+\.\d+\.\d+$/.test(h);
}

export function ssOwnedByXray(users, { pid, comm = "xray" } = {}) {
  if (!users) return false;
  for (const m of users.matchAll(/\("([^"]+)",pid=(\d+)/g)) {
    const name = m[1], p = +m[2];
    if (isXrayName(name) || name === comm) return true;
    if (pid && p === pid && isXrayName(name)) return true;
  }
  return false;
}

export function portsFromSsLntp(ssOut, opts = {}) {
  const found = [];
  for (const line of String(ssOut || "").split("\n")) {
    const rec = parseSsLine(line);
    if (!rec) continue;
    if (rec.proto !== "tcp" || rec.state !== "LISTEN") continue;
    if (!ssOwnedByXray(rec.users, opts)) continue;
    found.push({ port: rec.port, loopback: rec.loopback });
  }
  return found;
}

export function portsFromConfig(cfg) {
  const list = Array.isArray(cfg?.inbounds) ? cfg.inbounds : [];
  const out = [];
  for (const i of list) {
    const port = parseEnvPort(i?.port);
    if (!port) continue;
    const listen = String(i.listen ?? "0.0.0.0");
    const loopback = isLoopbackHost(listen);
    const pref = /^(vless|vmess|trojan|shadowsocks)$/i.test(String(i.protocol || "")) ? 0 : 1;
    out.push({ port, loopback, pref });
  }
  out.sort((a, b) => a.pref - b.pref || a.loopback - b.loopback || a.port - b.port);
  return out;
}

export function pickPort(entries) {
  const list = (entries || []).filter(e => parseEnvPort(e.port));
  if (!list.length) return null;
  const publicPorts = list.filter(e => !e.loopback);
  const pool = publicPorts.length ? publicPorts : [];
  if (!pool.length) return null; // 只有回环端口（比如 stats API）不算对外端口
  return Math.min(...pool.map(e => e.port));
}

export function resolveXrayPort({
  ssLntp,
  pid,
  config,
  envPort,
  fallback = DEFAULT_XRAY_PORT,
} = {}) {
  const fromSs = pickPort(portsFromSsLntp(ssLntp, { pid }));
  if (fromSs) return fromSs;
  const fromCfg = pickPort(portsFromConfig(config));
  if (fromCfg) return fromCfg;
  const fromEnv = parseEnvPort(envPort);
  if (fromEnv) return fromEnv;
  return parseEnvPort(fallback) || DEFAULT_XRAY_PORT;
}

export function listenEntries(ssOut, ports) {
  const allow = new Set((ports || []).map(parseEnvPort).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const line of String(ssOut || "").split("\n")) {
    const rec = parseSsLine(line);
    if (!rec || !allow.has(rec.port)) continue;
    if (rec.proto === "tcp" && rec.state !== "LISTEN") continue;
    if (rec.proto === "udp" && rec.state !== "UNCONN" && rec.state !== "LISTEN") continue;
    const key = rec.proto + ":" + rec.port;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export const wireguardPorts = () => WG_PORTS.slice();

export function peerHost(peer) {
  const p = String(peer || "");
  if (!p) return "";
  if (p.startsWith("[")) return p.replace(/^\[/, "").replace(/\]:\d+$/, "");
  const i = p.lastIndexOf(":");
  return i >= 0 ? p.slice(0, i) : p;
}

export function countEstablished(ssOut) {
  const lines = String(ssOut || "").split("\n").map(s => s.trim()).filter(Boolean);
  const remotes = new Set();
  for (const line of lines) {
    const a = line.split(/\s+/);
    const hasNetid = a[0] === "tcp" || a[0] === "udp";
    const peer = hasNetid ? a[5] : a[4];
    const host = peerHost(peer);
    if (host) remotes.add(host);
  }
  return { connections: lines.length, uniqueClients: remotes.size };
}

export function xrayListenPorts(xrayPort, wg = WG_PORTS) {
  const p = parseEnvPort(xrayPort);
  return [p, ...wg].filter(Boolean);
}
