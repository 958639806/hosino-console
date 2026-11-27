import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commandAllowed, todayUsageArgsAllowed, isTodayUsageNode, WORKSPACE } from '../plugin/execution-policy.mjs';

function allowed(cmd, extra = {}) {
  return commandAllowed({ cmd, workdir: WORKSPACE, ...extra }, fs, WORKSPACE);
}

test('todayUsage helpers accept only help or no args', () => {
  assert.equal(isTodayUsageNode('node'), true);
  assert.equal(isTodayUsageNode('/usr/bin/node'), true);
  assert.equal(isTodayUsageNode('python3'), false);
  assert.equal(todayUsageArgsAllowed([]), true);
  assert.equal(todayUsageArgsAllowed(['--help']), true);
  assert.equal(todayUsageArgsAllowed(['-h']), true);
  assert.equal(todayUsageArgsAllowed(['--date', '2026-11-27']), false);
  assert.equal(todayUsageArgsAllowed(['--state-dir=/tmp']), false);
});

test('commandAllowed allows node today_usage.mjs and no other node scripts', () => {
  const script = path.join(WORKSPACE, 'scripts/today_usage.mjs');
  assert.equal(fs.existsSync(script), true, 'workspace script must exist for this test');
  assert.equal(allowed('node scripts/today_usage.mjs'), true);
  assert.equal(allowed('nodejs scripts/today_usage.mjs'), true);
  assert.equal(allowed('/usr/bin/node scripts/today_usage.mjs'), true);
  assert.equal(allowed('/usr/bin/node ' + script), true);
  assert.equal(allowed('node scripts/today_usage.mjs --help'), true);
  assert.equal(allowed('node scripts/today_usage.mjs -h'), true);
  assert.equal(allowed('node scripts/today_usage.mjs --date 2026-11-27'), false);
  assert.equal(allowed('node scripts/today_usage.mjs --state-dir /tmp'), false);
  assert.equal(allowed('python3 scripts/today_usage.mjs'), false);
  assert.equal(allowed('node scripts/baidu_search.py --short hello'), false);
  assert.equal(commandAllowed({ cmd: 'node scripts/today_usage.mjs', workdir: WORKSPACE, env: { FOO: '1' } }, fs, WORKSPACE), false);
  assert.equal(commandAllowed({ cmd: 'node scripts/today_usage.mjs', workdir: WORKSPACE, elevated: true }, fs, WORKSPACE), false);
  assert.equal(allowed('node scripts/today_usage.mjs; id'), false);
  assert.equal(allowed('node scripts/today_usage.mjs && id'), false);
});
