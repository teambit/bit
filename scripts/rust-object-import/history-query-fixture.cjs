const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { inflateSync, deflateSync } = require('node:zlib');
const checkout = require('./checkout-transition-fixture.cjs');

async function createFixture(cli, directory, options = {}) {
  const fixture = await checkout.createFixture(cli, directory, options);
  const load = createRequire(path.join(cli, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Ref } = load('@teambit/objects');
  const { ComponentID } = load('@teambit/component-id');
  const { ExtensionDataEntry } = load('@teambit/legacy.extension-data');
  const scope = await Scope.load(directory, false);
  const dependency = await scope.getModelComponent(ComponentID.fromString(fixture.dependencyId));
  const versions = await Promise.all(
    [...fixture.versionRefs, dependency.head.toString()].map((hash) => scope.objects.load(new Ref(hash)))
  );
  for (const [index, version] of versions.entries()) {
    version.log.date = String(1700000000000 + index * 10000);
    version.extensions.push(
      new ExtensionDataEntry(
        undefined,
        undefined,
        'teambit.envs/envs',
        {},
        { type: 'node', id: 'teambit.harmony/node' }
      )
    );
  }
  // Historical workspace.get performs the actual env callback even for old tags.
  // Seed its ordinary canonical metadata before importing this disposable scope.
  await scope.objects.writeObjectsToTheFS(versions);
  Scope.scopeCache = {};
  return fixture;
}

// The imported tags are genuine repository objects. Additional query ancestry is
// created by public commands in disposable workspaces, never the user's scope.
const scenarios = [
  { name: 'log', command: ['log', 'component'] },
  { name: 'log-json', command: ['log', 'component', '--json'] },
  { name: 'log-parents', command: ['log', 'component', '--parents', '--full-hash'] },
  { name: 'log-hidden', command: ['log', 'component', '--show-hidden'] },
  { name: 'log-file', file: 'stable.txt', command: ['log-file'] },
  { name: 'log-file-one-line', file: 'stable.txt', command: ['log-file'], suffix: ['--one-line'] },
  { name: 'blame', file: 'stable.txt', command: ['blame'], suffix: ['--include-message'] },
  { name: 'binary-log-file', file: 'binary.bin', command: ['log-file'] },
  { name: 'binary-blame', file: 'binary.bin', command: ['blame'], suffix: ['--include-message'] },
  { name: 'tied-file-history', file: 'stable.txt', command: ['log-file'], suffix: ['--one-line'], tied: true },
  { name: 'tied-blame', file: 'stable.txt', command: ['blame'], tied: true },
  {
    name: 'version-history-show',
    command: ['version-history', 'show', 'component'],
    nativeExpectation: 'stateless-show',
  },
  {
    name: 'version-history-json',
    command: ['version-history', 'show', 'component', '--json'],
    nativeExpectation: 'parity-only',
  },
  { name: 'version-history-build', command: ['version-history', 'build', 'component', '--delete-existing'] },
  { name: 'tagged-log-hidden', command: ['log', 'component', '--show-hidden', '--parents'], tag: true },
  { name: 'lean-lane-log', command: ['log', 'component', '--parents'], lane: true },
  {
    name: 'lean-lane-history-build',
    command: ['version-history', 'build', 'component', '--from-all-lanes', '--delete-existing'],
    lane: true,
  },
  {
    name: 'missing-version-log',
    command: ['log', 'component'],
    damage: 'missing-version',
    canonicalError: true,
    errorText: 'was not found',
  },
  {
    name: 'corrupt-version-log',
    command: ['log', 'component'],
    damage: 'corrupt-version',
    canonicalError: true,
    errorText: 'JSON|Unexpected',
  },
  {
    name: 'missing-source-blame',
    file: 'stable.txt',
    command: ['blame'],
    damage: 'missing-source',
    canonicalError: true,
    errorText: 'ENOENT',
  },
  {
    name: 'corrupt-source-log-file',
    file: 'stable.txt',
    command: ['log-file'],
    damage: 'corrupt-source',
    canonicalError: true,
    errorText: 'zlib.inflate|incorrect header',
  },
];

async function prepare(directory, roots, successful) {
  const root = path.join(directory, roots[0]);
  const bodies = [
    Buffer.from('\uFEFFfirst 😀 line\r\nsecond café line\r\nthird unchanged line\r\n'),
    Buffer.from('\uFEFFfirst 😀 line\r\nsecond modified café line\r\nthird unchanged line\r\n'),
  ];
  for (let index = 0; index < bodies.length; index++) {
    await fs.writeFile(path.join(root, 'stable.txt'), bodies[index]);
    await successful(directory, [
      'snap',
      'component',
      '--message',
      `query snapshot ${index}\nUTF16 😀 metadata`,
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
    ]);
  }
}

function commandFor(scenario, roots) {
  return [
    ...scenario.command,
    ...(scenario.file ? [path.join(roots[0], scenario.file)] : []),
    ...(scenario.suffix || []),
  ];
}

async function prepareScenario(directory, roots, scenario, cli, successful) {
  if (scenario.tied)
    for (let index = 0; index < 2; index++) {
      await fs.writeFile(path.join(directory, roots[0], 'stable.txt'), `same second ${index} 😀\nshared tail\n`);
      await successful(directory, [
        'snap',
        'component',
        '--message',
        `query tied snapshot ${index}`,
        '--disable-snap-pipeline',
        '--ignore-issues',
        '*',
      ]);
    }
  if (scenario.tag)
    await successful(directory, [
      'tag',
      'component',
      '--unmodified',
      '--message',
      'query tag above snaps',
      '--disable-tag-pipeline',
      '--ignore-issues',
      '*',
    ]);
  if (scenario.lane) {
    await successful(directory, ['lane', 'create', 'query-lane', '--scope', 'qualification.destination']);
    await fs.writeFile(
      path.join(directory, roots[0], 'stable.txt'),
      'lane-only first 😀\nsecond lane line\nthird unchanged line\n'
    );
    await successful(directory, [
      'snap',
      'component',
      '--message',
      'query lane child',
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
    ]);
  }
  if (!scenario.damage) return;
  const load = createRequire(path.join(cli, 'package.json'));
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  const head = Object.values(bitmap).find((entry) => entry?.name === 'component').version;
  const objectPath = (hash) => path.join(directory, '.bit/objects', hash.slice(0, 2), hash.slice(2));
  let ref = head;
  if (scenario.damage.endsWith('source')) {
    const inflated = inflateSync(await fs.readFile(objectPath(head)));
    const version = JSON.parse(inflated.subarray(inflated.indexOf(0) + 1).toString());
    ref = version.files.find((file) => file.relativePath === 'stable.txt').file;
  }
  if (scenario.damage.startsWith('missing')) await fs.unlink(objectPath(ref));
  else {
    // Real malformed compressed object, not a method override or synthetic helper response.
    const inflated = inflateSync(await fs.readFile(objectPath(ref)));
    if (scenario.damage.endsWith('version')) {
      const header = inflated.subarray(0, inflated.indexOf(0)).toString().split(' ');
      const body = '{"malformedQueryVersion":';
      header[2] = String(body.length);
      await fs.writeFile(objectPath(ref), deflateSync(Buffer.from(header.join(' ') + '\0' + body)));
    } else await fs.writeFile(objectPath(ref), Buffer.from('not a compressed Source object'));
  }
}

async function capture(directory, roots) {
  const read = async (relative) => {
    try {
      return (await fs.readFile(path.join(directory, relative))).toString('hex');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const objects = {},
    objectRoot = path.join(directory, '.bit/objects');
  for (const shard of (await fs.readdir(objectRoot)).sort()) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(objectRoot, shard))).sort()) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      const bytes = await fs.readFile(path.join(objectRoot, shard, suffix));
      try {
        objects[shard + suffix] = inflateSync(bytes).toString('hex');
      } catch (error) {
        objects[shard + suffix] = {
          compressed: bytes.toString('hex'),
          inflateError: { name: error.name, code: error.code, message: error.message },
        };
      }
    }
  }
  return {
    objects,
    roots: Object.fromEntries(
      await Promise.all(roots.map(async (root) => [root, await checkout.readTree(path.join(directory, root))]))
    ),
    bitmap: await read('.bitmap'),
    config: await read('workspace.jsonc'),
    index: await read('.bit/index.json'),
    stagedSnaps: await read('.bit/staged-snaps'),
    unmerged: await read('.bit/unmerged.json'),
    stagedConfig: await checkout.readTree(path.join(directory, '.bit/staged-config')),
    lastMerged: await checkout.readTree(path.join(directory, '.bit/last-merged')),
  };
}

module.exports = {
  createFixture,
  capture,
  scenarios,
  prepare,
  prepareScenario,
  commandFor,
};
