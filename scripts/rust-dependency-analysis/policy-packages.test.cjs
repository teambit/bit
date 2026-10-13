const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { installed } = require('../rust-object-import/load-source.cjs');
const { resolvePackagePath } = installed('@teambit/legacy.utils');
const { resolvePackageData } = installed('@teambit/dependencies/dist/resolve-pkg-data.js');
function native(input) {
  const body = Buffer.from(JSON.stringify({ kind: 'dependencyPolicyPackages', ...input }));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(body.length, 8);
  return JSON.parse(
    execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
      input: Buffer.concat([header, body]),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  );
}
function canonical({ root, componentRoot, names }) {
  const resolved = {};
  for (const name of names) {
    const module = resolvePackagePath(name, componentRoot, root);
    const value = module && resolvePackageData(componentRoot, module);
    if (value)
      resolved[name] = {
        name: value.name,
        componentIdentity: value.componentId?.toString() ?? null,
        concreteVersion: value.concreteVersion ?? null,
      };
  }
  return { resolved };
}
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-policy-packages-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'workspace');
  const componentRoot = path.join(root, 'components/alpha');
  await fs.mkdir(componentRoot, { recursive: true });
  return { directory, root, componentRoot };
}
async function pkg(root, name, data) {
  const directory = path.join(root, 'node_modules', name);
  await fs.mkdir(directory, { recursive: true });
  if (data) await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(data));
}
test('native package metadata matches actual Node aliases, component IDs, snapshots and workspace boundaries', async (t) => {
  const state = await setup(t);
  const { root, componentRoot, directory } = state;
  const names = [
    'ordinary',
    '@scope/scoped',
    'alias',
    'component',
    'snap',
    'unversioned',
    'missing',
    'directory-only',
    'shadowed',
    'outside',
  ];
  await pkg(directory, 'outside', { name: 'outside', version: '9.0.0' });
  await pkg(root, 'shadowed', { name: 'shadowed', version: '1.0.0' });
  for (let i = 0; i < 24; i++) {
    await fs.writeFile(
      path.join(componentRoot, 'package.json'),
      JSON.stringify({ name: 'consumer', dependencies: i % 2 ? { packageName: '1.0.0' } : { ordinary: '^1.0.0' } })
    );
    const componentId = { scope: 'qualification.policy', name: 'component', version: i % 3 ? '2.0.0' : 'latest' };
    await pkg(root, 'ordinary', { name: 'ordinary', version: i % 2 ? '1.0.0' : '' });
    await pkg(root, '@scope/scoped', { name: '@scope/scoped', version: '1.2.3' });
    await pkg(root, 'alias', { name: '@original/name', version: '3.0.0' });
    await pkg(root, 'component', {
      name: 'component',
      componentId,
      version: i % 2 ? '4.0.0' : undefined,
      exported: i % 3 !== 0,
    });
    await pkg(componentRoot, 'snap', {
      name: 'snap',
      componentId: { ...componentId, version: 'a'.repeat(40) },
      version: '0.0.0-' + 'a'.repeat(40),
    });
    await pkg(componentRoot, 'unversioned', {
      name: 'unversioned',
      componentId: { ...componentId, version: undefined },
    });
    await pkg(componentRoot, 'directory-only');
    await pkg(componentRoot, 'shadowed', { name: 'shadowed', version: `${i + 2}.0.0` });
    const request = { root, componentRoot, names };
    const actual = native(request);
    assert.equal(actual.failed, false, `case ${i}`);
    assert.deepEqual(actual.data, canonical(request), `case ${i}`);
    assert.equal(actual.data.resolved.outside, undefined);
  }
});
test('malformed metadata and unsafe package paths decline the whole native batch', async (t) => {
  const { root, componentRoot } = await setup(t);
  await pkg(root, 'valid', { name: 'valid', version: '1.0.0' });
  await pkg(root, 'broken', { name: 'broken', version: '1.0.0' });
  await fs.writeFile(path.join(root, 'node_modules/broken/package.json'), '{');
  const request = { root, componentRoot, names: ['valid', 'broken'] };
  assert.throws(() => canonical(request));
  assert.equal(native(request).failed, true);
  assert.equal(native({ ...request, names: ['../escape'] }).failed, true);
  assert.equal(native({ ...request, names: ['valid'] }).failed, false);
  await fs.writeFile(path.join(componentRoot, 'package.json'), '{');
  const missing = { ...request, names: ['missing'] };
  assert.deepEqual(native(missing).data, canonical(missing));
  assert.equal(native({ ...request, names: ['valid'] }).failed, true);
});
