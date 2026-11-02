const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {PassThrough} = require('node:stream');
const source = fs.readFileSync(path.join(__dirname, '../server.mjs'), 'utf8');

function fixture(t, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosino-upload-test-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const context = vm.createContext({
    ROOT: root, fs, path, crypto, Buffer, TextDecoder, process:{env},
    httpErr:(http, message) => Object.assign(new Error(message), {http}),
    sniff:() => null, isCliId:() => false, cliLoad:() => null,
    atomicWrite:(file, data) => fs.writeFileSync(file, data),
    setTimeout:() => ({unref(){}}), setInterval:() => ({unref(){}}),
  });
  const code = source.slice(source.indexOf('const UP_DIR ='), source.indexOf('// 取一组上传'));
  const api = vm.runInContext(code + ';({upReceive,upSweep,activeUploads,upMeta});', context);
  return {...api, root, uploadDir:path.join(root, 'data/uploads')};
}

test('cleanup protects a live upload until metadata is committed', async t => {
  const f = fixture(t);
  const request = new PassThrough(); request.headers = {};
  const pending = f.upReceive(request, new URL('http://local/api/uploads?scope=chat&session=test&name=note.txt'));
  const [id] = f.activeUploads;
  assert.ok(id);
  assert.equal(f.upMeta(id), null);
  f.upSweep();
  assert.ok(fs.existsSync(path.join(f.uploadDir, id)));
  request.end('upload contents');
  const result = await pending;
  assert.equal(result.id, id);
  assert.equal(result.size, Buffer.byteLength('upload contents'));
  assert.equal(f.activeUploads.size, 0);
  f.upSweep();
  assert.equal(fs.readFileSync(path.join(f.uploadDir, id, 'f'), 'utf8'), 'upload contents');
});

test('cleanup still removes abandoned fragments and expired attachments', t => {
  const f = fixture(t);
  const orphan = 'a'.repeat(24), expired = 'b'.repeat(24), valid = 'c'.repeat(24);
  for (const id of [orphan, expired, valid]) fs.mkdirSync(path.join(f.uploadDir, id), {recursive:true});
  for (const [id, createdAt] of [[expired, 1], [valid, Date.now()]]) {
    fs.writeFileSync(path.join(f.uploadDir, id, 'meta.json'), JSON.stringify({id,createdAt}));
  }
  f.upSweep();
  assert.equal(fs.existsSync(path.join(f.uploadDir, orphan)), false);
  assert.equal(fs.existsSync(path.join(f.uploadDir, expired)), false);
  assert.equal(fs.existsSync(path.join(f.uploadDir, valid)), true);
});

test('failed upload releases its active slot and removes partial data', async t => {
  const f = fixture(t, {UPLOAD_MAX_BYTES:'4'});
  const request = new PassThrough(); request.headers = {};
  const pending = f.upReceive(request, new URL('http://local/api/uploads?scope=chat&session=test&name=note.txt'));
  request.end('too big');
  await assert.rejects(pending, error => error.http === 413);
  assert.equal(f.activeUploads.size, 0);
  assert.deepEqual(fs.readdirSync(f.uploadDir), []);
});
