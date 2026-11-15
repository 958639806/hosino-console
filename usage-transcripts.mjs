import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { normalizeUsage } from './usage-pricing.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
const decode = (bytes, encoding) => {
  const b = Buffer.from(bytes);
  if (encoding === 'zstd' || b.subarray(0,4).equals(Buffer.from([0x28,0xb5,0x2f,0xfd]))) return zstdDecompressSync(b).toString('utf8');
  if (b[0] === 0x1f && b[1] === 0x8b) return gunzipSync(b).toString('utf8');
  return b.toString('utf8');
};
export async function readUsageTranscripts({ stateDir }) {
  const records = [], sourceErrors = [], agents = [], seen = new Set();
  const fail = (agent, source, code) => sourceErrors.push({ agent, source, code });
  const add = (event, agent, session, position, source, fallbackTime) => {
    const m = event?.message;
    if (!m || typeof m !== 'object' || !['assistant','user','tool','toolResult'].includes(m.role)) return;
    const raw = m.usage ?? event.usage;
    if (m.role !== 'assistant' && !raw) return;
    const id = event.id;
    const dedupeKey = hash(`${agent}\0${session}\0${id ? 'id:' + id : source + ':' + position}`);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const timestamp = typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : fallbackTime;
    records.push({ agent, dedupeKey, timestamp, provider: m.provider ?? event.provider, model: m.model ?? event.model, usage: normalizeUsage(raw) });
  };
  const lines = (text, agent, session, source) => {
    let i = 0, invalid = 0;
    for (const line of text.split('\n')) {
      i++;
      if (!line.trim()) continue;
      try { add(JSON.parse(line), agent, session, i, source); } catch { invalid++; }
    }
    if (invalid) fail(agent, source, 'invalid_json_records');
  };
  let dirs;
  try { dirs = await fs.readdir(path.join(stateDir,'agents'), { withFileTypes: true }); }
  catch { return { records, agents, sourceErrors: [{ source: 'agents', code: 'state_unavailable' }] }; }
  for (const entry of dirs.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const agent = entry.name; agents.push(agent);
    const base = path.join(stateDir,'agents',agent), archiveNames = new Set();
    const dbPath = path.join(base,'agent','openclaw-agent.sqlite');
    let hasDb = false;
    try { await fs.access(dbPath); hasDb = true; } catch {}
    if (hasDb) {
      let db;
      try {
        const { DatabaseSync } = await import('node:sqlite');
        db = new DatabaseSync(dbPath, { readOnly: true, allowExtension: false });
        db.exec('BEGIN');
        const exists = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
        if (!exists('transcript_events')) throw new Error('unsupported_schema');
        const columns = new Set(db.prepare('PRAGMA table_info(transcript_events)').all().map(c => c.name));
        if (!columns.has('event_json') || !columns.has('session_id') || !columns.has('seq')) throw new Error('unsupported_schema');
        const sql = `SELECT session_id,seq,event_json,${columns.has('event_zstd') ? 'event_zstd' : 'NULL AS event_zstd'},${columns.has('created_at') ? 'created_at' : 'NULL AS created_at'} FROM transcript_events ORDER BY session_id,seq`;
        let i = 0;
        for (const row of db.prepare(sql).iterate()) {
          try { add(JSON.parse(row.event_json ?? decode(row.event_zstd,'zstd')),agent,row.session_id,row.seq,'sqlite',row.created_at); }
          catch { fail(agent,'sqlite','invalid_event_record'); }
          if (++i % 512 === 0) await yieldLoop();
        }
        if (exists('session_transcript_archives')) for (const row of db.prepare('SELECT session_id,archive_name,archive_blob,encoding FROM session_transcript_archives').iterate()) {
          try { lines(decode(row.archive_blob,row.encoding),agent,row.session_id,'archive'); archiveNames.add(row.archive_name); }
          catch { fail(agent,'archive','archive_decode_failed'); }
        }
        if (exists('session_transcript_cold_archives')) for (const row of db.prepare('SELECT session_id,archive_name,archive_blob,storage FROM session_transcript_cold_archives').iterate()) {
          try {
            const bytes = row.storage === 'sqlite' ? row.archive_blob : await fs.readFile(path.join(base,'sessions',path.basename(row.archive_name)));
            lines(decode(bytes),agent,row.session_id,'cold_archive'); archiveNames.add(row.archive_name);
          } catch { fail(agent,'cold_archive','archive_decode_failed'); }
        }
      } catch { fail(agent,'sqlite','database_read_failed'); }
      finally { db?.close(); }
    }
    let files = [];
    try { files = await fs.readdir(path.join(base,'sessions'), { withFileTypes: true }); }
    catch (e) { if (!hasDb || e.code !== 'ENOENT') fail(agent,'sessions','sessions_unavailable'); }
    for (const file of files.sort((a,b) => a.name.localeCompare(b.name))) {
      if (!file.isFile() || archiveNames.has(file.name) || !/\.jsonl(?:$|\.(?:deleted|reset|gz|zst)(?:\.|$))|\.(?:deleted|reset)\..*\.zst$/.test(file.name)) continue;
      const session = file.name.split('.')[0];
      try { lines(decode(await fs.readFile(path.join(base,'sessions',file.name))),agent,session,'file'); }
      catch { fail(agent,'file','transcript_read_failed'); }
      await yieldLoop();
    }
  }
  return { records, sourceErrors, agents };
}
