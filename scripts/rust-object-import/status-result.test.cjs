const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { installed } = require('./load-source.cjs');
const { ModelComponent, Ref, VersionHistory } = installed('@teambit/objects');
const { ComponentID } = installed('@teambit/component-id');
const { getDivergeData } = installed('@teambit/component.snap-distance');
const { snapshotSemverGrammar } = installed('@teambit/pkg.modules.semver-helper');
const ref = (number) => new Ref(number.toString(16).padStart(40, '0'));
function request(value) {
  const body = Buffer.from(JSON.stringify({ kind: 'statusResult', ...value }));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(body.length, 8);
  return JSON.parse(
    execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
      input: Buffer.concat([header, body]),
      encoding: 'utf8',
      maxBuffer: 40 * 1024 * 1024,
    })
  );
}
function normalize(distance) {
  return {
    sourceOnly: distance.snapsOnSourceOnly.map(String),
    targetOnly: distance.snapsOnTargetOnly.map(String),
    noCommon: !!distance.err,
  };
}

test('full status model sections match canonical staging and outdated methods over cached histories', async () => {
  for (let index = 0; index < 96; index += 1) {
    const versions = Array.from({ length: 7 }, (_, offset) => ({
      hash: ref(offset + 1),
      parents: offset ? [ref(offset)] : [],
    }));
    if (index % 3 === 0) versions[6].parents = [ref(3)];
    const raw = {
      scope: 'qualification.status',
      name: 'component',
      versions: { '1.0.0': ref(2).toString(), '2.0.0': ref(4).toString(), '3.0.0-beta.1': ref(6).toString() },
      head: ref(3 + (index % 5)).toString(),
      state: { versions: { '1.0.0': { local: index % 2 === 0 } } },
      ...(index % 4 === 0 ? { detachedHeads: { heads: [ref(7).toString()], current: ref(7).toString() } } : {}),
    };
    const model = ModelComponent.parse(JSON.stringify(raw));
    const history = new VersionHistory({ name: model.name, scope: model.scope, versions });
    const repo = {
      load: async (hash) => {
        assert.equal(hash.toString(), history.hash().toString());
        return history;
      },
      unmergedComponents: { getEntry: () => undefined },
    };
    model.remoteHead = index % 8 ? ref(index % 8) : undefined;
    const workspaceVersion = ['1.0.0', '2.0.0', ref(7).toString()][index % 3];
    const id = ComponentID.fromObject({ scope: model.scope, name: model.name, version: workspaceVersion });
    const tracked = index % 7 !== 0;
    await model.setDivergeData(repo, false, true, tracked ? id : undefined);
    const status = normalize(model.getDivergeData());
    const mergeData = await getDivergeData({
      repo,
      modelComponent: model,
      targetHead: model.remoteHead || null,
      throws: false,
    });
    const merge = normalize(mergeData);
    const input = {
      currentLaneId: 'qualification.status/main',
      targets: tracked
        ? [{ identity: model.id(), version: workspaceVersion, modified: false, issues: [], dependencies: [] }]
        : [],
      models: [raw],
      histories: [{ identity: model.id(), remoteHead: model.remoteHead?.toString() || null, status, merge }],
      semver: snapshotSemverGrammar([
        ...Object.keys(raw.versions),
        workspaceVersion,
        raw.head,
        ...versions.map((version) => version.hash.toString()),
      ]),
    };
    const staged = tracked ? await model.isLocallyChanged(repo, null, id) : model.isLocallyChangedRegardlessOfLanes();
    const stagedComponents = staged
      ? [{ id: model.id(), versions: await model.getLocalTagsOrHashes(repo, tracked ? id : undefined) }]
      : [];
    const mergePendingComponents = tracked && mergeData.isDiverged() ? [model.id()] : [];
    const outdatedComponents = [];
    if (tracked && !mergePendingComponents.length) {
      const local = model.getHeadRegardlessOfLaneAsTagOrHash();
      const latest = await model.headIncludeRemote(repo);
      if (latest !== local || model.isLatestGreaterThan(workspaceVersion)) {
        outdatedComponents.push({ id: model.id(), headVersion: latest, latestVersion: model.latestVersionIfExist() });
      }
    }
    const actual = request(input);
    assert.equal(actual.failed, false, `case ${index}`);
    assert.deepEqual(actual.data.stagedComponents, stagedComponents, `staged ${index}`);
    assert.deepEqual(actual.data.mergePendingComponents, mergePendingComponents, `merge ${index}`);
    assert.deepEqual(actual.data.outdatedComponents, outdatedComponents, `outdated ${index}`);
    assert.deepEqual(
      actual.data.snappedComponents,
      tracked && model.isHeadSnap() ? [model.id()] : [],
      `snapped ${index}`
    );
  }
});

test('ambiguous labels, unsupported histories and missing target models decline without partial output', () => {
  const base = { currentLaneId: 'scope/main', targets: [], models: [], histories: [], semver: {} };
  for (const patch of [
    { currentLaneId: 'scope/feature' },
    { targets: [{ identity: 'scope/missing', version: '1.0.0', modified: false, issues: [], dependencies: [] }] },
    {
      models: [{ scope: 'scope', name: 'a', versions: { '1.0.0': 'a', '2.0.0': 'a' }, head: 'a' }],
      histories: [
        {
          identity: 'scope/a',
          status: { sourceOnly: [], targetOnly: [], noCommon: false },
          merge: { sourceOnly: [], targetOnly: [], noCommon: false },
        },
      ],
    },
  ]) {
    const actual = request({ ...base, ...patch });
    assert.equal(actual.failed, true, JSON.stringify(patch));
    assert.equal(actual.data, undefined);
  }
  assert.equal(request(base).failed, false);
});
