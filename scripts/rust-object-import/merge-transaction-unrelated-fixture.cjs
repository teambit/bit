const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
// A genuinely new lane component is born independently of the existing remote main Version.
// This mirrors merge-lanes-unrelated.e2e.ts without rewriting Version parents or models.
async function prepareUnrelated({ directory, roots, fixture, command }) {
  const run = async (args) => {
    const result = await command(directory, args, 'node');
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  await run(['init', '--skip-interactive', '--default-scope', 'qualification.checkout']);
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile));
  scope.remotes = fixture.remotes;
  scope.name = 'qualification.destination';
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'merge-transaction-qualification', private: true, type: 'module' })
  );
  await run(['lane', 'create', 'independent', '--scope', 'qualification.checkout']);
  await fs.mkdir(roots.root, { recursive: true });
  await fs.writeFile(path.join(roots.root, 'index.js'), 'export default "independent lane origin";\n');
  await run(['add', path.relative(directory, roots.root), '--id', 'component', '--main', 'index.js']);
  await run([
    'snap',
    fixture.id,
    '--skip-auto-snap',
    '--disable-snap-pipeline',
    '--ignore-issues',
    '*',
    '--message',
    'independently born lane',
  ]);
  await run(['export']);
  await run(['import', fixture.id, '--objects', '--all-history', '--skip-dependency-installation']);
}
module.exports = { prepareUnrelated };
