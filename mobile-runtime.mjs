import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const failure = (http, code, message) => Object.assign(new Error(message), { http, code });
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const requestPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const copy = value => value == null ? value : structuredClone(value);
const dictionary = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const text = value => typeof value === 'string' && value.length > 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const timestamp = value => Number.isFinite(value) && value >= 0;
function validState(state) {
  if (!dictionary(state) || state.version !== 1 || !['devices', 'requests', 'runs'].every(key => dictionary(state[key]))) return false;
  for (const [id, device] of Object.entries(state.devices)) {
    if (!dictionary(device) || device.id !== id || !/^[a-f0-9]{24}$/.test(id) || !text(device.name) || !text(device.owner)
      || !timestamp(device.createdAt) || !timestamp(device.updatedAt) || !timestamp(device.accessExpiresAt) || !timestamp(device.refreshExpiresAt)
      || !(device.revokedAt === null ? hash(device.accessHash) && hash(device.refreshHash) : timestamp(device.revokedAt) && device.accessHash === null && device.refreshHash === null)) return false;
  }
  for (const [key, record] of Object.entries(state.requests)) {
    if (!dictionary(record) || !requestPattern.test(record.requestId || '') || !text(record.owner) || key !== `${record.owner}:${record.requestId}`
      || !text(record.operation) || !text(record.session) || !hash(record.fingerprint) || !text(record.gatewayKey)
      || !['pending', 'unknown', 'completed', 'failed'].includes(record.state) || !timestamp(record.createdAt) || !timestamp(record.updatedAt)
      || (['completed', 'failed'].includes(record.state) && (!Number.isInteger(record.status) || record.status < 100 || record.status > 599))) return false;
  }
  for (const [id, run] of Object.entries(state.runs)) {
    if (!dictionary(run) || run.runId !== id || !text(run.sessionId) || !text(run.runId) || !timestamp(run.startedAt)
      || !['running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(run.state)
      || (run.finishedAt !== undefined && !timestamp(run.finishedAt))) return false;
  }
  return true;
}

// One server process owns this store. Sync write + fsync + rename commits a receipt
// before any downstream dispatch. Never remove unknown receipts to enable retries.
export class MobileRuntime {
  constructor({ directory, now = Date.now, accessTtlMs = 15 * 60e3, refreshTtlMs = 30 * 864e5, cliEnabled = false, origins = ['https://localhost'] }) {
    this.directory = directory;
    this.file = path.join(directory, 'state.json');
    this.now = now;
    this.accessTtlMs = accessTtlMs;
    this.refreshTtlMs = refreshTtlMs;
    this.cliEnabled = cliEnabled;
    this.origins = new Set(origins);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!validState(this.state)) throw new Error('Invalid or unsupported mobile state');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // Corruption must fail closed.
      this.state = { version: 1, devices: {}, requests: {}, runs: {} };
    }
    for (const record of Object.values(this.state.requests)) if (record.state === 'pending') {
      record.state = 'unknown'; record.updatedAt = now(); record.error = '服务端重启，执行结果需要核对'; record.code = 'request_unknown';
    }
    for (const run of Object.values(this.state.runs)) if (run.state === 'running') {
      run.state = 'interrupted'; run.finishedAt = now(); run.reason = 'server_restarted';
    }
    this.persist();
  }

  persist() {
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.state)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temporary, this.file);
      const directoryFd = fs.openSync(this.directory, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  tokens(device) {
    const accessToken = `hs_access_${device.id}.${crypto.randomBytes(32).toString('base64url')}`;
    const refreshToken = `hs_refresh_${device.id}.${crypto.randomBytes(32).toString('base64url')}`;
    device.accessHash = digest(accessToken); device.refreshHash = digest(refreshToken);
    device.accessExpiresAt = this.now() + this.accessTtlMs;
    device.refreshExpiresAt = this.now() + this.refreshTtlMs;
    device.updatedAt = this.now();
    this.persist();
    return { device: { id: device.id, name: device.name }, accessToken, refreshToken, accessExpiresAt: device.accessExpiresAt, refreshExpiresAt: device.refreshExpiresAt };
  }

  issueDevice(name) {
    const id = crypto.randomBytes(12).toString('hex');
    this.state.devices[id] = { id, name: String(name || 'Android').trim().slice(0, 80) || 'Android', owner: 'owner', createdAt: this.now(), revokedAt: null };
    return this.tokens(this.state.devices[id]);
  }

  credential(token, kind) {
    const match = new RegExp(`^hs_${kind}_([a-f0-9]{24})\\.[A-Za-z0-9_-]{43}$`).exec(token || '');
    const device = match && this.state.devices[match[1]];
    if (!device || device.revokedAt != null || !equal(device[`${kind}Hash`], digest(token))) throw failure(401, 'AUTH_REVOKED', '设备凭据无效或已撤销');
    if (device[`${kind}ExpiresAt`] <= this.now()) throw failure(401, 'AUTH_EXPIRED', '设备凭据已过期');
    return device;
  }

  authenticate(token) {
    const device = this.credential(token, 'access');
    return { id: device.id, name: device.name, owner: device.owner, permissions: { cli: this.cliEnabled } };
  }

  refresh(token) { return this.tokens(this.credential(token, 'refresh')); }

  revoke(id) {
    const device = this.state.devices[id];
    if (!device) throw failure(404, 'device_missing', '设备不存在');
    device.revokedAt = this.now(); device.accessHash = null; device.refreshHash = null; this.persist();
  }

  devices() { return Object.values(this.state.devices).map(({ id, name, createdAt, updatedAt, revokedAt }) => ({ id, name, createdAt, updatedAt, revokedAt })); }

  requestKey(requestId, owner) {
    if (!requestPattern.test(requestId || '')) throw failure(400, 'request_id_invalid', 'requestId 必须为 8–128 位字母、数字、下划线或连字符');
    return `${owner}:${requestId}`;
  }

  beginRequest({ owner = 'owner', requestId, operation, session, payload }) {
    const key = this.requestKey(requestId, owner);
    if (!text(owner) || !text(operation) || !text(session)) throw failure(400, 'request_target_invalid', '缺少请求操作或目标会话');
    const fingerprint = digest(canonical({ operation, session, payload }));
    const existing = this.state.requests[key];
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw failure(409, 'request_conflict', '同一 requestId 已用于不同内容或目标');
      return { created: false, record: copy(existing) };
    }
    const record = { requestId, owner, operation, session, fingerprint, gatewayKey: crypto.randomUUID(), state: 'pending', createdAt: this.now(), updatedAt: this.now() };
    this.state.requests[key] = record; this.persist();
    return { created: true, record: copy(record) };
  }

  completeRequest(requestId, result, status = 200, owner = 'owner') {
    const record = this.state.requests[this.requestKey(requestId, owner)];
    if (!record) throw failure(404, 'request_missing', '请求记录不存在');
    Object.assign(record, { state: 'completed', status, result: copy(result), updatedAt: this.now() }); this.persist();
  }

  failRequest(requestId, { status = 502, error, code, unknown = false }, owner = 'owner') {
    const record = this.state.requests[this.requestKey(requestId, owner)];
    if (!record) throw failure(404, 'request_missing', '请求记录不存在');
    Object.assign(record, { state: unknown ? 'unknown' : 'failed', status, error: String(error || '请求失败'), code, updatedAt: this.now() }); this.persist();
  }

  getRequest(requestId, owner = 'owner') {
    const record = this.state.requests[this.requestKey(requestId, owner)];
    if (!record) return null;
    const { fingerprint, gatewayKey, owner: _owner, ...publicRecord } = record;
    return copy(publicRecord);
  }

  recordRun(run) {
    if (!run.runId || !run.sessionId) throw new Error('runId and sessionId required');
    this.state.runs[run.runId] = { ...this.state.runs[run.runId], ...copy(run) }; this.persist();
  }

  runsForSession(sessionId) {
    const runs = Object.values(this.state.runs).filter(run => run.sessionId === sessionId).sort((a, b) => b.startedAt - a.startedAt);
    return copy({ activeRun: runs.find(run => run.state === 'running') || null, lastRun: runs[0] || null });
  }

  corsHeaders(origin, method, requestHeaders = '') {
    if (!origin) return {};
    if (!this.origins.has(origin)) throw failure(403, 'FORBIDDEN', '不允许的客户端来源');
    if (!['GET', 'POST', 'DELETE', 'OPTIONS'].includes(method)) throw failure(403, 'FORBIDDEN', '不允许的请求方法');
    const allowed = new Set(['authorization', 'content-type', 'x-hs', 'range', 'x-filename']);
    if (requestHeaders.split(',').some(header => header.trim() && !allowed.has(header.trim().toLowerCase()))) throw failure(403, 'FORBIDDEN', '不允许的请求头');
    return { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-HS, Range, X-Filename', 'access-control-expose-headers': 'Content-Type, Content-Length, Content-Disposition, Content-Range, Accept-Ranges, Retry-After', 'access-control-max-age': '600' };
  }
}
