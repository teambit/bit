// Deliberate public callback failure after Repository's real object/remote-lane writes.
// Setup commands never load this preload; this is a callback fault, not an FS fault.
if (process.env.BIT_HISTORY_RESET_PERSIST_FAULT === 'after-unmerged-write') {
  const path = require('node:path');
  const fs = require('node:fs/promises');
  const { createRequire } = require('node:module');
  const load = createRequire(path.join(process.env.BIT_HISTORY_RESET_PRIVATE_CLI, 'package.json'));
  const { UnmergedComponents } = load('@teambit/legacy.scope/dist/lanes/unmerged-components.js');
  const original = UnmergedComponents.prototype.write;
  let calls = 0;
  UnmergedComponents.prototype.write = async function (...args) {
    await original.apply(this, args);
    await fs.writeFile(
      path.join(process.cwd(), '.bit/history-reset-persist-fault.json'),
      JSON.stringify({ calls: ++calls })
    );
    throw new Error('deliberate history reset callback failure after persisted prefix');
  };
}
