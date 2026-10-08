const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
exports.commandWorkspace = (cliRoot, provenance, requested = process.env.BIT_COMMAND_BENCH_WORKSPACE) => {
  const root = requested ? path.resolve(requested) : cliRoot;
  assert.ok([os.tmpdir(), '/tmp'].some((directory) => root.startsWith(directory + path.sep)));
  assert.equal(fs.realpathSync(root), root, 'workspace cannot alias a checkout');
  let fixture;
  if (requested) {
    fixture = JSON.parse(fs.readFileSync(path.join(root, '.rust-install-fixture.json')));
    assert.equal(fixture.schemaVersion, 1);
    assert.equal(fixture.cliRevision, provenance.revision);
    assert.ok(Number.isSafeInteger(fixture.componentCount) && fixture.componentCount > 0);
    for (const [relative, digest] of Object.entries(fixture.sources)) {
      const filename = path.resolve(root, relative);
      assert.ok(filename.startsWith(root + path.sep));
      assert.ok(fs.realpathSync(filename).startsWith(root + path.sep));
      assert.equal(createHash('sha256').update(fs.readFileSync(filename)).digest('hex'), digest, relative);
    }
  }
  const scope = fs.existsSync(path.join(root, '.git/bit')) ? '.git/bit' : '.bit';
  const cache = path.join(root, scope, 'cache/components/deps');
  let existing = path.dirname(cache);
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  assert.equal(fs.realpathSync(existing), existing, 'cache ancestors cannot alias shared state');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  assert.equal(fs.realpathSync(path.dirname(cache)), path.dirname(cache));
  if (fs.existsSync(cache)) assert.equal(fs.realpathSync(cache), cache, 'cache leaf cannot alias shared state');
  return { root, cache, componentCount: fixture?.componentCount || provenance.componentCount, fixture };
};
exports.benchmarkGlobals = (temporary) => {
  const root = path.join(temporary, 'globals');
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'config/config.json'),
    JSON.stringify({ analytics_reporting: 'false', error_reporting: 'false', anonymous_reporting: 'false' })
  );
  return root;
};
