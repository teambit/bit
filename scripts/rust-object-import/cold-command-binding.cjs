const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function verifyCli(cli, allowUnmarkedCli = false) {
  const marker = await fs
    .readFile(path.join(cli, '.bit-object-import-build.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (allowUnmarkedCli && error.code === 'ENOENT') return null;
      throw error;
    });
  if (!marker) return { marker, original: null, modules: [] };
  const original = JSON.parse(await fs.readFile(path.join(cli, '.bit-rust-private-build.json'), 'utf8'));
  assert.equal(marker.installedRevision, original.revision);
  const modules = new Map(original.compiledModules.map((entry) => [entry.path, entry]));
  for (const entry of marker.compiledModules) modules.set(entry.path, entry);
  const verified = [];
  for (const entry of modules.values()) {
    const bytes = await fs.readFile(path.join(cli, 'node_modules/@teambit', entry.path));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, entry.sha256, `compiled CLI module changed: ${entry.path}`);
    verified.push({ path: entry.path, sha256: hash });
  }
  return { marker, original, modules: verified };
}
module.exports = { verifyCli };
