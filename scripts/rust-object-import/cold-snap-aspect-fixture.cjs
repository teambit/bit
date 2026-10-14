const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');

// The same public bare-scope API used by update-dependents-cascade-import.e2e.ts.
// Its fresh process prevents loadBit singleton state leaking between setup and commands.
async function prepareHiddenAspectSnap({ cli, directory, roots, fixture, command, runApi }) {
  const load = createRequire(path.join(cli, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const common = 'export default "hidden aspect consumer";\n';
  const snap = (id) => [
    'snap',
    id,
    '--unmodified',
    '--skip-auto-snap',
    '--disable-snap-pipeline',
    '--ignore-issues',
    '*',
  ];
  const run = async (args) => {
    const result = await command(directory, args, 'node');
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  // Produce a real default-Node component aspect, with no custom runtime provider.
  await fs.writeFile(
    path.join(roots.dependencyRoot, 'index.js'),
    'const { Aspect } = require("@teambit/harmony");\nmodule.exports = Aspect.create({ id: "qualification.checkout/dependency" });\n'
  );
  const harmony = path.join(directory, 'node_modules/@teambit/harmony');
  await fs.mkdir(path.dirname(harmony), { recursive: true });
  await fs.rm(harmony, { recursive: true, force: true });
  await fs.symlink(path.join(cli, 'node_modules/@teambit/harmony'), harmony, 'dir');
  await run(['compile']);
  await run([...snap(fixture.dependencyId), '--message', 'public component aspect']);
  await run(['aspect', 'set', fixture.id, fixture.dependencyId]);
  await fs.writeFile(path.join(roots.root, 'index.js'), common);
  await run([...snap(fixture.id), '--message', 'hidden merge common main']);
  await run(['export']);
  await run(['lane', 'create', 'hidden', '--scope', 'qualification.checkout']);
  await fs.appendFile(path.join(roots.dependencyRoot, 'index.js'), '\n// aspect on lane\n');
  await run([...snap(fixture.dependencyId), '--message', 'visible leaf lane']);
  await run(['export']);
  const bare = path.join(path.dirname(directory), 'bare-hidden-seed');
  await fs.rm(bare, { recursive: true, force: true });
  const scope = await Scope.ensure(bare, 'qualification.hidden-seed');
  await scope.ensureDir();
  const scopeFile = path.join(bare, 'scope.json');
  const scopeData = JSON.parse(await fs.readFile(scopeFile));
  scopeData.remotes = fixture.remotes;
  await fs.writeFile(scopeFile, JSON.stringify(scopeData));
  const helperRoot = path.dirname(load.resolve('@teambit/legacy.e2e-helper'));
  const runner = path.join(helperRoot, 'snap-from-scope-runner.js');
  const seeded = await runApi(directory, runner, [
    bare,
    JSON.stringify([{ componentId: fixture.id, message: 'hidden updateDependent seed' }]),
    JSON.stringify({ lane: 'qualification.checkout/hidden', updateDependents: true, push: true }),
  ]);
  assert.equal(seeded.code, 0, seeded.stderr || seeded.stdout);
  await run(['switch', 'main', '--skip-fetch', '--skip-dependency-installation']);
  await fs.writeFile(path.join(roots.root, 'index.js'), common + 'export const mainAdvance = "main-only";\n');
  await run([
    'tag',
    fixture.id,
    '--ver',
    '2.0.0',
    '--skip-auto-tag',
    '--disable-tag-pipeline',
    '--ignore-issues',
    '*',
    '--message',
    'advance hidden main',
  ]);
  await run(['export']);
  // A fresh public lane import contains only the visible leaf. The parent stays hidden.
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory);
  await run(['init', '--skip-interactive', '--default-scope', 'qualification.destination']);
  const localFile = path.join(directory, '.bit/scope.json');
  const local = JSON.parse(await fs.readFile(localFile));
  local.remotes = fixture.remotes;
  local.name = 'qualification.destination';
  await fs.writeFile(localFile, JSON.stringify(local));
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'merge-transaction-qualification', private: true, type: 'module' })
  );
  await run(['lane', 'import', 'qualification.checkout/hidden', '--skip-dependency-installation']);
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  assert.ok(
    !Object.values(bitmap).some((row) => row?.name === 'component'),
    'parent is genuinely absent from workspace bitmap'
  );
  assert.ok(
    Object.values(bitmap).some((row) => row?.name === 'dependency'),
    'visible dependency imported'
  );
}

module.exports = { prepareHiddenAspectSnap };
