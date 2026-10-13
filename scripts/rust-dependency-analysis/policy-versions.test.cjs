const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { installed } = require('../rust-object-import/load-source.cjs');
const { updateDependenciesVersions } = installed(
  '@teambit/dependencies/dist/dependencies-loader/dependencies-versions-resolver.js'
);
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
const semver = installed('semver');
const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
const ids = (values) => ComponentIdList.fromArray(values.map((id) => ComponentID.fromString(id)));
async function canonical(request) {
  const entries = request.entries.map((entry) => ({
    id: ComponentID.fromString(entry.identity),
    packageName: entry.packageName ?? undefined,
    versionRange: entry.versionRange ?? undefined,
  }));
  const component = {
    id: ComponentID.fromString('scope/self@1.0.0'),
    ...Object.fromEntries(
      fields.map((field, i) => [field, { get: () => request.components[i].map((index) => entries[index]) }])
    ),
    extensions: request.extensions.map((id) => ({ extensionId: ComponentID.fromString(id) })),
    overrides: { getComponentDependenciesWithVersion: () => request.sources.componentConfig },
    componentFromModel: { getAllDependenciesIds: () => ids(request.sources.model) },
  };
  await updateDependenciesVersions(
    {
      calcComponentRangePrefixByConsumerComponent: () => request.policy.prefix,
      getWorkspacePolicyManifest: () => ({ dependencies: request.policy.workspace }),
    },
    {
      consumer: { bitmapIdsFromCurrentLane: ids(request.sources.bitmap) },
      getAutoDetectConfigMerge: () => Object.fromEntries(fields.map((field, i) => [field, request.policy.merge[i]])),
      getCurrentLaneObject: async () => ({ updateDependents: ids(request.sources.lane) }),
    },
    component,
    {
      envOwnPkgNames: new Set(request.policy.envOwn),
      getDependenciesToAddManually: () =>
        Object.fromEntries(fields.map((field, i) => [field, request.policy.manual[i]])),
    },
    Object.fromEntries(fields.map((field, i) => [field, request.policy.automatic[i]]))
  );
  return {
    entries: entries.map((entry) => ({
      identity: entry.id.toString(),
      packageName: entry.packageName ?? null,
      versionRange: entry.versionRange ?? null,
    })),
    extensions: component.extensions.map((entry) => entry.extensionId.toString()),
  };
}
function cases() {
  let state = 827;
  const next = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
  const names = ['alpha', 'beta', '@scope/pkg'];
  const hashes = ['a'.repeat(40), 'B'.repeat(40)];
  const versions = ['', 'latest', '1.0.0', '2.3.4', ...hashes];
  const specs = [
    '',
    '-',
    '+',
    '1.2.3',
    '^2.0.0',
    '~3.0.0',
    '*',
    '>=1 <4',
    'v1.2.3',
    'nonsense',
    ...hashes,
    `0.0.0-${hashes[0]}`,
  ];
  const grammar = Object.fromEntries(
    specs.map((spec) => [
      spec,
      { valid: !!semver.valid(spec), range: !!semver.validRange(spec), coerced: semver.coerce(spec)?.version ?? null },
    ])
  );
  const map = () =>
    Object.fromEntries(names.filter(() => next(3) === 0).map((name) => [name, specs[next(specs.length)]]));
  const identity = (i) => {
    const version = versions[next(versions.length)];
    return `scope/component${i % 3}${version && version !== 'latest' ? '@' + version : ''}`;
  };
  const source = () => Array.from({ length: next(7) }, (_, i) => identity(i));
  return Array.from({ length: 1024 }, () => {
    const entries = Array.from({ length: next(7) }, (_, i) => ({
      identity: identity(i),
      packageName: next(4) ? names[next(names.length)] : null,
      versionRange: next(2) ? specs[next(specs.length)] : null,
    }));
    return {
      entries,
      components: fields.map(() => entries.flatMap((_, i) => (next(3) === 0 ? [i] : []))),
      extensions: source(),
      sources: {
        bitmap: source(),
        lane: source(),
        model: source(),
        componentConfig: Object.fromEntries(
          [0, 1, 2].filter(() => next(4) === 0).map((i) => [`scope/component${i}`, versions[next(versions.length)]])
        ),
      },
      policy: {
        manual: [map(), map(), map()],
        envOwn: names.filter(() => next(2)),
        workspace: map(),
        automatic: [map(), map(), map()],
        merge: [map(), map(), map()],
        prefix: [null, '', '-', '^', '~', '*'][next(6)],
      },
      grammar,
    };
  });
}
test('native component version selection matches actual Node precedence, ranges and shared dependencies', async () => {
  const requests = cases();
  const frames = requests.map((request, index) => {
    const body = Buffer.from(JSON.stringify({ kind: 'dependencyPolicyVersions', ...request }));
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(index + 1, 4);
    header.writeUInt32BE(body.length, 8);
    return Buffer.concat([header, body]);
  });
  const responses = execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
    input: Buffer.concat(frames),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .map(JSON.parse);
  for (let index = 0; index < requests.length; index++) {
    assert.equal(responses[index].failed, false, `case ${index}`);
    assert.deepEqual(
      responses[index].data,
      await canonical(requests[index]),
      `case ${index}: ${JSON.stringify(requests[index])}`
    );
  }
});

test('version planning declines invalid indices, inherited policy names and missing grammar atomically', () => {
  const base = {
    entries: [{ identity: 'scope/alpha@1.0.0', packageName: 'alpha', versionRange: null }],
    components: [[0], [], []],
    extensions: [],
    sources: { bitmap: [], lane: [], model: [], componentConfig: {} },
    policy: {
      manual: [{ alpha: '^2.0.0' }, {}, {}],
      envOwn: [],
      workspace: {},
      automatic: [{}, {}, {}],
      merge: [{}, {}, {}],
      prefix: '^',
    },
    grammar: { '^2.0.0': { valid: false, range: true, coerced: '2.0.0' } },
  };
  const invalid = [
    { ...base, components: [[1], [], []] },
    { ...base, grammar: {} },
    { ...base, policy: { ...base.policy, workspace: { constructor: '2.0.0' } } },
    { ...base, sources: { ...base.sources, lane: Array(65537).fill('scope/alpha@1.0.0') } },
  ];
  const requests = invalid.flatMap((request) => [request, base]);
  const frames = requests.map((request, index) => {
    const body = Buffer.from(JSON.stringify({ kind: 'dependencyPolicyVersions', ...request }));
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(index + 1, 4);
    header.writeUInt32BE(body.length, 8);
    return Buffer.concat([header, body]);
  });
  const responses = execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
    input: Buffer.concat(frames),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .map(JSON.parse);
  responses.forEach((response, index) => {
    assert.equal(response.failed, index % 2 === 0);
    if (response.failed) assert.equal(response.data, undefined);
    else assert.equal(response.data.entries[0].identity, 'scope/alpha@2.0.0');
  });
});
