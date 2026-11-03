const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');

// Copy all application modules so fixtures keep working when server.mjs gains
// another local import. Never copy credentials or persistent runtime data.
function copyRuntime(source, target) {
  for (const name of fs.readdirSync(source)) {
    if (name.endsWith('.mjs') && fs.statSync(path.join(source, name)).isFile()) {
      fs.copyFileSync(path.join(source, name), path.join(target, name));
    }
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  timer.unref();
  try { child.kill('SIGTERM'); await exited; }
  finally { clearTimeout(timer); }
}

module.exports = {copyRuntime, stopChild};
