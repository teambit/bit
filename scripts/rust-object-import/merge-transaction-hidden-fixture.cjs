const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');

// The same public bare-scope API used by update-dependents-cascade-import.e2e.ts.
// Its fresh process prevents loadBit singleton state leaking between setup and commands.
async function prepareHiddenMainMerge({ cli, directory, roots, fixture, command, runApi }) {
  const load = createRequire(path.join(cli, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const common = 'import dependency from "@qualification/checkout.dependency";\nexport default dependency;\n';
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
  await fs.writeFile(path.join(roots.root, 'index.js'), common);
  await run([...snap(fixture.id), '--message', 'hidden merge common main']);
  await run(['export']);
  await run(['lane', 'create', 'hidden', '--scope', 'qualification.checkout']);
  await fs.writeFile(path.join(roots.dependencyRoot, 'index.js'), 'export default "dependency on lane";\n');
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
module.exports = { prepareHiddenMainMerge };

function laneRecord(state) {
  const lanes = Object.values(state.objects)
    .filter((value) => typeof value === 'string')
    .map((hex) => {
      const bytes = Buffer.from(hex, 'hex');
      const zero = bytes.indexOf(0);
      return bytes.subarray(0, zero).toString().startsWith('Lane ')
        ? JSON.parse(bytes.subarray(zero + 1).toString())
        : undefined;
    })
    .filter((row) => row?.name === 'hidden' && row.scope === 'qualification.checkout');
  assert.equal(lanes.length, 1, 'one actual stored hidden lane');
  return lanes[0];
}
function assertHiddenMerge(before, after) {
  const original = laneRecord(before),
    merged = laneRecord(after);
  assert.equal(original.updateDependents.length, 1);
  assert.equal(merged.updateDependents.length, 1);
  assert.notEqual(
    merged.updateDependents[0],
    original.updateDependents[0],
    'hidden entry advanced during public main merge'
  );
  assert.ok(
    !merged.components.some((row) => row.id.name === 'component'),
    'hidden parent never promoted into visible lane components'
  );
  const hash = merged.updateDependents[0].split('@')[1];
  const bytes = Buffer.from(after.objects[hash], 'hex');
  const version = JSON.parse(bytes.subarray(bytes.indexOf(0) + 1).toString());
  assert.equal(version.parents.length, 2, 'hidden result retains both main and lane parents');
  assert.ok(
    version.parents.includes(original.updateDependents[0].split('@')[1]),
    'old hidden parent remains an exact parent ref'
  );
  const model = Object.values(before.objects)
    .filter((value) => typeof value === 'string')
    .map((hex) => {
      const body = Buffer.from(hex, 'hex');
      const zero = body.indexOf(0);
      return body.subarray(0, zero).toString().startsWith('Component ')
        ? JSON.parse(body.subarray(zero + 1).toString())
        : undefined;
    })
    .find((row) => row?.name === 'component' && row.scope === 'qualification.checkout');
  assert.ok(model?.versions['2.0.0'], 'actual advanced main tag is present');
  const mainHash = model.versions['2.0.0'];
  assert.ok(version.parents.includes(mainHash), 'main advanced head remains the other exact parent');
  const mainBytes = Buffer.from(after.objects[mainHash], 'hex');
  const mainVersion = JSON.parse(mainBytes.subarray(mainBytes.indexOf(0) + 1).toString());
  assert.equal(
    version.files.find((file) => file.relativePath === 'index.js').file,
    mainVersion.files.find((file) => file.relativePath === 'index.js').file,
    'hidden merge absorbs exact main Source content'
  );
}
module.exports.assertHiddenMerge = assertHiddenMerge;
