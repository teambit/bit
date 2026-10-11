const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_LANE_RECOVERY_COMPILED === '1';
const root = path.dirname(installed.resolve('@teambit/merge-lanes'));
const { LastMerged } = compiled
  ? require(path.join(root, 'last-merged.js'))
  : source('scopes/lanes/merge-lanes/last-merged.ts');
const { Lane, withRustSnapshotOperation } = installed('@teambit/objects');
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.resolve(__dirname, '../../native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-lane-recovery-test-'));
  const backup = path.join(directory, 'last-merged');
  const bitmap = path.join(directory, '.bitmap');
  const workspace = path.join(directory, 'workspace.jsonc');
  const stagedConfig = path.join(directory, 'staged-config.json');
  const lane = new Lane({
    name: 'destination',
    scope: 'qualification.recovery',
    hash: 'a'.repeat(40),
    log: { date: '1800000000000' },
  });
  const events = [];
  const scope = {
    path: directory,
    getLastMergedPath() {
      return backup;
    },
    async getStagedConfig() {
      return {
        filePath: stagedConfig,
        isEmpty: () => false,
        async deleteFile() {
          events.push('delete-config');
          await fs.rm(stagedConfig, { force: true });
        },
      };
    },
    legacyScope: {
      objects: {
        async writeObjectsToTheFS(objects) {
          events.push('lane-written');
          assert.equal(objects[0].name, 'destination');
        },
      },
    },
  };
  const consumer = {
    getPath: () => directory,
    bitMap: { mapPath: bitmap, getAllTrackDirs: () => ({}) },
    config: { path: workspace },
    scope: {
      path: directory,
      stagedSnaps: {
        isEmpty: () => false,
        async deleteFile() {
          events.push('delete-snaps');
          await fs.rm(path.join(directory, 'staged-snaps'), { force: true });
        },
      },
    },
  };
  await fs.mkdir(backup);
  await fs.writeFile(bitmap, 'current bitmap');
  await fs.writeFile(workspace, 'current workspace');
  scope.legacyScope.stagedSnaps = consumer.scope.stagedSnaps;
  const merger = new LastMerged(scope, consumer, { clearStatusLine() {} });
  return { directory, backup, bitmap, workspace, stagedConfig, lane, events, scope, consumer, merger };
}
async function modes(action) {
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    for (const flag of ['off', 'on']) {
      process.env.BIT_RUST_CLIENT_VCS = flag;
      const f = await fixture();
      try {
        await withRustSnapshotOperation(() => action(f, flag));
      } finally {
        await fs.rm(f.directory, { recursive: true, force: true });
      }
    }
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
}
test('lane recovery preserves the already-written lane prefix before corrupt bitmap failure', async () => {
  await modes(async (f) => {
    await fs.writeFile(path.join(f.backup, 'lane'), await f.lane.compress());
    await fs.writeFile(path.join(f.backup, 'bitmap'), '{ invalid');
    await fs.writeFile(path.join(f.backup, 'workspace.jsonc'), 'backup workspace');
    await assert.rejects(f.merger.restoreFromLastMerged({ silent: true }, f.lane));
    assert.deepEqual(f.events, ['lane-written']);
    assert.equal(await fs.readFile(f.bitmap, 'utf8'), 'current bitmap');
    assert.equal(await fs.readFile(f.workspace, 'utf8'), 'current workspace');
    await fs.stat(f.backup);
  });
});
test('cancelled custom prompt retains lane prefix and does not restore workspace or staged files', async () => {
  await modes(async (f) => {
    await fs.writeFile(path.join(f.backup, 'lane'), await f.lane.compress());
    await fs.writeFile(path.join(f.backup, 'bitmap'), '{ "version": "17.0.0" }');
    await fs.writeFile(path.join(f.backup, 'workspace.jsonc'), 'backup workspace');
    f.merger.mergeAbortPrompt = async () => {
      f.events.push('prompt');
      throw new Error('cancelled');
    };
    await assert.rejects(f.merger.restoreFromLastMerged({}, f.lane), /cancelled/);
    assert.deepEqual(f.events, ['lane-written', 'prompt']);
    assert.equal(await fs.readFile(f.bitmap, 'utf8'), 'current bitmap');
    assert.equal(await fs.readFile(f.workspace, 'utf8'), 'current workspace');
    await fs.stat(f.backup);
  });
});
test('snapshot persistence observes fresh staged bytes after custom lane compression callback', async () => {
  await modes(async (f) => {
    const bitmapCopy = path.join(f.directory, 'bitmap-copy');
    const workspaceCopy = path.join(f.directory, 'workspace-copy');
    const stagedCopy = path.join(f.directory, 'staged-copy');
    await fs.writeFile(bitmapCopy, 'bitmap snapshot');
    await fs.writeFile(workspaceCopy, 'workspace snapshot');
    await fs.writeFile(stagedCopy, 'before callback');
    const compressed = await f.lane.compress();
    f.lane.compress = async () => {
      await fs.writeFile(stagedCopy, 'after callback');
      return compressed;
    };
    await f.merger.persistSnapshot({
      copyOfCurrentLane: f.lane,
      copyOfBitmap: bitmapCopy,
      copyOfWorkspaceJsonc: workspaceCopy,
      copyOfStagedSnaps: stagedCopy,
    });
    assert.equal(await fs.readFile(path.join(f.backup, 'staged-snaps'), 'utf8'), 'after callback');
    assert.equal(await fs.readFile(path.join(f.backup, 'bitmap'), 'utf8'), 'bitmap snapshot');
    assert.deepEqual(await fs.readFile(path.join(f.backup, 'lane')), compressed);
  });
});
test('snapshot compression error leaves only the canonical persisted backup prefix', async () => {
  await modes(async (f) => {
    const bitmapCopy = path.join(f.directory, 'bitmap-copy');
    const workspaceCopy = path.join(f.directory, 'workspace-copy');
    await fs.writeFile(bitmapCopy, 'bitmap snapshot');
    await fs.writeFile(workspaceCopy, 'workspace snapshot');
    await fs.writeFile(path.join(f.backup, 'old'), 'obsolete');
    f.lane.compress = async () => {
      throw new Error('compression hook');
    };
    await assert.rejects(
      f.merger.persistSnapshot({
        copyOfCurrentLane: f.lane,
        copyOfBitmap: bitmapCopy,
        copyOfWorkspaceJsonc: workspaceCopy,
      }),
      /compression hook/
    );
    assert.deepEqual((await fs.readdir(f.backup)).sort(), ['bitmap', 'workspace.jsonc']);
  });
});

test('workspace root aliases survive restore while bitmap and config recover', async () => {
  await modes(async (f) => {
    const priorDirectory = process.cwd();
    await fs.mkdir(path.join(f.directory, '.bit'));
    await fs.mkdir(path.join(f.directory, 'alias'));
    await fs.writeFile(path.join(f.directory, 'unrelated.txt'), 'keep unrelated bytes');
    await fs.writeFile(path.join(f.directory, '.bit/protected'), 'keep repository');
    await fs.writeFile(path.join(f.backup, 'bitmap'), '// backup comment\n{ "version": "17.0.0", }');
    await fs.writeFile(path.join(f.backup, 'workspace.jsonc'), '// restored config\n{}\n');
    f.consumer.bitMap.getAllTrackDirs = () => ({
      '.': 'root-id',
      'alias/..': 'root-alias',
      [f.directory]: 'absolute-root',
    });
    process.chdir(f.directory);
    try {
      const result = await f.merger.restoreFromLastMerged({ silent: true });
      assert.deepEqual(result.compDirsToRemove, []);
      assert.equal(await fs.readFile(path.join(f.directory, 'unrelated.txt'), 'utf8'), 'keep unrelated bytes');
      assert.equal(await fs.readFile(path.join(f.directory, '.bit/protected'), 'utf8'), 'keep repository');
      assert.equal(await fs.readFile(f.bitmap, 'utf8'), '// backup comment\n{ "version": "17.0.0", }');
      assert.equal(await fs.readFile(f.workspace, 'utf8'), '// restored config\n{}\n');
    } finally {
      process.chdir(priorDirectory);
    }
  });
});

test('missing bitmap scope preserves the typed error after the lane write prefix', async () => {
  const { BitMap } = installed('@teambit/legacy.bit-map');
  const bytes = Buffer.from('{ "version": "17.0.0", "one": { "scope": "", "rootDir": "x" } }');
  let expected;
  try {
    BitMap.loadFromContentWithoutLoadingFiles(bytes, '', '', '');
  } catch (error) {
    expected = error;
  }
  assert.equal(expected.constructor.name, 'MissingScope');
  await modes(async (f) => {
    await fs.writeFile(path.join(f.backup, 'lane'), await f.lane.compress());
    await fs.writeFile(path.join(f.backup, 'bitmap'), bytes);
    await fs.writeFile(path.join(f.backup, 'workspace.jsonc'), 'backup workspace');
    await assert.rejects(f.merger.restoreFromLastMerged({ silent: true }, f.lane), (error) => {
      assert.equal(error.constructor, expected.constructor);
      assert.equal(error.message, expected.message);
      return true;
    });
    assert.deepEqual(f.events, ['lane-written']);
    assert.equal(await fs.readFile(f.bitmap, 'utf8'), 'current bitmap');
    assert.equal(await fs.readFile(f.workspace, 'utf8'), 'current workspace');
  });
});

test('native backup bitmap planning matches the canonical parser across ordinary and malformed metadata', async () => {
  const cp = require('node:child_process');
  const { BitMap } = installed('@teambit/legacy.bit-map');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-recovery-bitmap-corpus-'));
  const filename = path.join(directory, 'bitmap');
  const child = cp.spawn(path.toNamespacedPath(helper), ['--threads', '1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise((resolve) => child.once('close', resolve));
  let pending,
    bytes = Buffer.alloc(0),
    sequence = 0;
  child.once('error', (error) => pending?.reject(error));
  child.stdout.on('data', (chunk) => {
    bytes = Buffer.concat([bytes, chunk]);
    const newline = bytes.indexOf(10);
    if (newline < 0) return;
    try {
      const response = JSON.parse(bytes.subarray(0, newline));
      assert.ok(pending);
      assert.equal(response.id, pending.id);
      bytes = bytes.subarray(newline + 1);
      assert.equal(bytes.length, 0);
      clearTimeout(pending.timer);
      pending.resolve(response);
      pending = undefined;
    } catch (error) {
      pending?.reject(error);
      child.kill();
    }
  });
  child.once('exit', (code) => pending?.reject(new Error(`bitmap helper exited ${code}`)));
  function request(input) {
    return new Promise((resolve, reject) => {
      const body = Buffer.from(JSON.stringify(input));
      const header = Buffer.alloc(12);
      header.write('BMT1');
      header.writeUInt32BE(++sequence, 4);
      header.writeUInt32BE(body.length, 8);
      pending = {
        resolve,
        reject,
        id: sequence,
        timer: setTimeout(() => {
          child.kill();
          reject(new Error('bitmap timeout'));
        }, 30000),
      };
      child.stdin.write(Buffer.concat([header, body]));
    });
  }
  const corpus = [];
  for (let index = 0; index < 60; index++) {
    const row = {
      name: `component-${index}`,
      scope: index % 3 ? 'qualification.recovery' : '',
      rootDir: `roots/${index}`,
      version: '1.0.0',
    };
    if (!row.scope) row.defaultScope = 'qualification.recovery';
    const bitmap = { version: '17.0.0', [`component-${index}`]: row };
    if (index % 4 === 0)
      bitmap._bit_lane = { id: { scope: 'qualification.recovery', name: 'destination' }, exported: false };
    let body = JSON.stringify(bitmap);
    if (index % 2 === 0) body = '// backup comment\n' + body.slice(0, -1) + ',}';
    corpus.push({ body, current: [row.rootDir, `introduced/${index}`], ordinary: true });
  }
  for (const body of [
    '{,}',
    '{invalid}',
    'null',
    '[]',
    '{}',
    '{ "one": null }',
    '{ "one": { "scope": "", "rootDir": "x" } }',
    '{ "one": { "scope": "", "defaultScope": "", "rootDir": "x" } }',
    '{ "one": { "scope": "q.s", "rootDir": 4 } }',
    '{ "_bit_lane": { "id": null } }',
    '{ "one": { "scope": "bad scope", "rootDir": "x" } }',
  ])
    corpus.push({ body, current: ['x', 'introduced'] });
  for (const rootDir of ['.', '', 'constructor', '__proto__', 'nested/../other', 'windows\\path', '/absolute/path'])
    corpus.push({
      body: JSON.stringify({ version: '17.0.0', one: { scope: 'qualification.recovery', name: 'one', rootDir } }),
      current: [rootDir, 'introduced'],
    });
  let accepted = 0,
    ordinaryAccepted = 0;
  try {
    for (const cell of corpus) {
      await fs.writeFile(filename, cell.body);
      let expected, error;
      try {
        const bitmap = BitMap.loadFromContentWithoutLoadingFiles(Buffer.from(cell.body), '', '', '');
        const previous = bitmap.getAllTrackDirs();
        expected = cell.current.filter((dir) => !previous[dir]);
      } catch (failure) {
        error = failure;
      }
      const result = await request({ kind: 'recoveryBitmap', path: filename, currentRootDirs: cell.current });
      assert.equal(result.version, 1);
      assert.deepEqual(result.skipped, []);
      if (result.failed) {
        assert.equal(result.completed, 0);
        continue;
      }
      assert.equal(result.completed, 1);
      assert.equal(error, undefined, `native accepted invalid canonical bitmap: ${cell.body}`);
      assert.deepEqual(result.data.removeDirs, expected, cell.body);
      accepted++;
      if (cell.ordinary) ordinaryAccepted++;
    }
    assert.ok(ordinaryAccepted >= 30, `ordinary native bitmap positives: ${ordinaryAccepted}`);
    assert.ok(accepted >= 30);
  } finally {
    child.stdin.end();
    await closed;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('recovery copies preserve the existing destination inode, mode and user metadata like Node', async (t) => {
  const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
  const recovery = compiled
    ? require(path.join(objectsRoot, 'objects/rust-lane-recovery.js'))
    : source('scopes/scope/objects/objects/rust-lane-recovery.ts');
  const snapshot = compiled
    ? require(path.join(objectsRoot, 'objects/rust-snapshot.js'))
    : source('scopes/scope/objects/objects/rust-snapshot.ts');
  const fse = installed('fs-extra');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-recovery-metadata-'));
  const sourceFile = path.join(directory, 'source');
  const nativeFile = path.join(directory, 'native');
  const nodeFile = path.join(directory, 'node');
  await fs.writeFile(sourceFile, Buffer.from([0, 255, 10, 65]));
  await fs.writeFile(nativeFile, 'old native');
  await fs.writeFile(nodeFile, 'old node');
  await fs.chmod(sourceFile, 0o640);
  const beforeNative = await fs.stat(nativeFile),
    beforeNode = await fs.stat(nodeFile);
  let xattrs = false;
  const cp = require('node:child_process');
  if (process.platform === 'linux') {
    const setup = cp.spawnSync('python3', [
      '-c',
      'import os,sys\nfor p in sys.argv[1:]: os.setxattr(p,"user.bit_recovery",b"preserve-destination")',
      nativeFile,
      nodeFile,
    ]);
    xattrs = setup.status === 0;
    if (!xattrs) t.diagnostic('user xattrs unavailable on fixture filesystem');
  }
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await fse.copyFile(sourceFile, nodeFile);
    const completed = await snapshot.withRustSnapshotOperation(() =>
      recovery.advanceRustRecovery([{ kind: 'copy', source: sourceFile, destination: nativeFile }])
    );
    if (process.platform === 'linux') assert.equal(completed, 1, 'ordinary Linux copy really executes in Rust');
    else {
      assert.equal(completed, 0, 'unsupported platform declines before writing');
      assert.equal(await fs.readFile(nativeFile, 'utf8'), 'old native');
      await fse.copyFile(sourceFile, nativeFile);
    }
    assert.deepEqual(await fs.readFile(nativeFile), await fs.readFile(nodeFile));
    const afterNative = await fs.stat(nativeFile),
      afterNode = await fs.stat(nodeFile);
    if (process.platform !== 'win32') {
      assert.equal(afterNative.ino, beforeNative.ino);
      assert.equal(afterNode.ino, beforeNode.ino);
      assert.equal(afterNative.mode, afterNode.mode);
      assert.equal(afterNative.uid, beforeNative.uid);
      assert.equal(afterNative.gid, beforeNative.gid);
    }
    if (xattrs) {
      const attrs = cp.spawnSync(
        'python3',
        [
          '-c',
          'import os,sys,json\nprint(json.dumps([os.getxattr(p,"user.bit_recovery").decode() for p in sys.argv[1:]]))',
          nativeFile,
          nodeFile,
        ],
        { encoding: 'utf8' }
      );
      assert.equal(attrs.status, 0, attrs.stderr);
      assert.deepEqual(JSON.parse(attrs.stdout), ['preserve-destination', 'preserve-destination']);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test(
  'acknowledged recovery prefix is not replayed after the helper fails',
  { skip: process.platform === 'win32' },
  async () => {
    const cp = require('node:child_process');
    const fse = installed('fs-extra');
    const { ScopeMain } = require(
      path.join(path.dirname(installed.resolve('@teambit/scope')), 'scope.main.runtime.js')
    );
    const f = await fixture();
    const bitmapCopy = path.join(f.directory, 'bitmap-copy');
    const workspaceCopy = path.join(f.directory, 'workspace-copy');
    const fake = path.join(f.directory, 'prefix-helper');
    await fs.writeFile(bitmapCopy, 'acknowledged bitmap');
    await fs.writeFile(workspaceCopy, 'workspace replay');
    await fs.writeFile(
      fake,
      `#!/usr/bin/env node
const fs=require('fs');let bytes=Buffer.alloc(0),operations;
process.stdin.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=12&&bytes.length>=12+bytes.readUInt32BE(8)){const id=bytes.readUInt32BE(4),size=bytes.readUInt32BE(8),input=JSON.parse(bytes.subarray(12,12+size));bytes=bytes.subarray(12+size);let data;
if(input.kind==='recoveryInitialize'){operations=input.operations;if(operations.length!==4)process.exit(2);data={token:'a'.repeat(40)};}
else if(input.kind==='recoveryAdvance'){fs.rmSync(operations[0].path,{recursive:true,force:true});fs.mkdirSync(operations[1].path,{recursive:true});fs.copyFileSync(operations[2].source,operations[2].destination);fs.writeFileSync(operations[2].source,'changed after acknowledged prefix');data={completed:3,nextIndex:3,failed:true};}
else process.exit(3);
const ack=JSON.stringify({version:1,id,completed:1,skipped:[],failed:false,data})+'\\n';process.stdout.write(ack,()=>{if(input.kind==='recoveryAdvance')process.exit(0);});}});
`
    );
    await fs.chmod(fake, 0o755);
    const scope = Object.create(ScopeMain.prototype);
    scope.legacyScope = { path: f.directory };
    f.merger.scope = scope;
    const originalSpawn = cp.spawn,
      originalCopy = fse.copyFile;
    const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
      priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
    let reaped = false,
      replayCopies = 0,
      spawned = 0;
    cp.spawn = function (executable, ...args) {
      const child = originalSpawn.call(this, executable, ...args);
      if (executable === path.toNamespacedPath(fake)) {
        spawned++;
        child.once('close', () => {
          reaped = true;
          fse.copyFile = async (...copyArgs) => {
            assert.ok(reaped, 'failed helper is reaped before replaying the remaining phase');
            replayCopies++;
            return originalCopy(...copyArgs);
          };
        });
      }
      return child;
    };
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    process.env.BIT_RUST_OBJECT_IMPORT = fake;
    try {
      await f.merger.persistSnapshot({ copyOfBitmap: bitmapCopy, copyOfWorkspaceJsonc: workspaceCopy });
      assert.equal(spawned, 1, 'public snapshot phase used the deliberately failing helper');
      assert.ok(reaped);
      assert.equal(replayCopies, 1, 'only the unacknowledged workspace copy replays');
      assert.equal(await fs.readFile(path.join(f.backup, 'bitmap'), 'utf8'), 'acknowledged bitmap');
      assert.equal(await fs.readFile(bitmapCopy, 'utf8'), 'changed after acknowledged prefix');
      assert.equal(await fs.readFile(path.join(f.backup, 'workspace.jsonc'), 'utf8'), 'workspace replay');
    } finally {
      cp.spawn = originalSpawn;
      fse.copyFile = originalCopy;
      await fs.rm(f.directory, { recursive: true, force: true });
      if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
      else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
      if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
      else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
    }
  }
);

test('public Sources reset preserves parent/common Ref aliases on main, visible and hidden lanes', async () => {
  const { createMergeFixture } = require('./merge-history-fixture.cjs');
  const { Scope } = installed('@teambit/legacy.scope');
  const { Ref, ModelComponent } = installed('@teambit/objects');
  const objectRoot = path.dirname(installed.resolve('@teambit/objects'));
  const adapter = require(path.join(objectRoot, 'objects/rust-reset-refs.js'));
  const original = adapter.planRustResetRefs;
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS;
  const oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  let accepted = 0;
  adapter.planRustResetRefs = async (...args) => {
    const result = await original(...args);
    if (result) accepted++;
    return result;
  };
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    for (const scenario of ['main-parent', 'visible-common', 'hidden-common']) {
      const outcomes = [];
      for (const flag of ['off', 'on']) {
        process.env.BIT_RUST_CLIENT_VCS = flag;
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-public-reset-'));
        try {
          const f = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
          const headHash = await f.publishRemoteSibling();
          const scope = await Scope.load(directory, false);
          const head = new Ref(headHash);
          const version = await scope.objects.load(head);
          const parent = version.parents[0];
          const common = new Ref(f.baseRef);
          const model = ModelComponent.from({
            name: 'component',
            scope: 'qualification.merge',
            versions: { '1.0.0': new Ref(f.baseRef), '1.0.1': head },
            head,
          });
          model.divergeData = { commonSnapBeforeDiverge: scenario === 'main-parent' ? undefined : common };
          const id = model.toComponentId();
          const lane =
            scenario === 'main-parent'
              ? undefined
              : new Lane({
                  name: 'destination',
                  scope: 'qualification.merge',
                  hash: 'a'.repeat(40),
                  log: { date: '1800000000000' },
                });
          if (lane) {
            lane.isNew = false;
            model.laneHeadRemote = new Ref(f.baseRef);
            if (scenario === 'visible-common') lane.addComponent({ id, head });
            else lane.addComponentToUpdateDependents(id.changeVersion(headHash));
          }
          const beforeAccepted = accepted;
          await withRustSnapshotOperation(() =>
            scope.sources.removeComponentVersions(model, [head], ['1.0.1'], lane, scenario === 'main-parent')
          );
          const expectedRef = scenario === 'main-parent' ? parent : common;
          assert.equal(model.head, expectedRef, `${scenario}/${flag} original chosen Ref`);
          if (lane) {
            assert.equal(model.laneHeadLocal, common);
            const item = lane.getComponent(id) || lane.getUpdateDependentAsLaneComponent(id);
            assert.equal(item.head.toString(), common.toString());
            if (scenario === 'visible-common') assert.equal(item.head, common);
          }
          assert.equal(accepted - beforeAccepted, flag === 'on' ? 1 : 0, `${scenario}: actual native plan`);
          outcomes.push({
            head: model.head.toString(),
            versions: Object.keys(model.versions),
            lane: lane?.toObject(),
            detached: model.detachedHeads.heads.map(String),
          });
        } finally {
          await fs.rm(directory, { recursive: true, force: true });
        }
      }
      assert.deepEqual(outcomes[1], outcomes[0]);
    }
  } finally {
    adapter.planRustResetRefs = original;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  }
});

test('public reset falls back after an acknowledged plan when cached parent identity changes', async () => {
  const { createMergeFixture } = require('./merge-history-fixture.cjs');
  const { Scope } = installed('@teambit/legacy.scope');
  const { Ref, ModelComponent } = installed('@teambit/objects');
  const objectRoot = path.dirname(installed.resolve('@teambit/objects'));
  const recovery = require(path.join(objectRoot, 'objects/rust-lane-recovery.js'));
  const original = recovery.requestRustRecovery;
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS;
  const oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-stale-reset-'));
  try {
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    process.env.BIT_RUST_OBJECT_IMPORT = helper;
    const f = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
    const headHash = await f.publishRemoteSibling();
    const scope = await Scope.load(directory, false);
    const head = new Ref(headHash);
    const version = await scope.objects.load(head);
    const replacement = new Ref(f.baseRef);
    const model = ModelComponent.from({
      name: 'component',
      scope: 'qualification.merge',
      versions: { '1.0.0': new Ref(f.baseRef), '1.0.1': head },
      head,
    });
    let acknowledged = 0;
    recovery.requestRustRecovery = async (...args) => {
      const result = await original(...args);
      if (args[0].kind === 'resetRefsPlan' && result) {
        acknowledged++;
        version.parents[0] = replacement;
      }
      return result;
    };
    await withRustSnapshotOperation(() =>
      scope.sources.removeComponentVersions(model, [head], ['1.0.1'], undefined, true)
    );
    assert.equal(acknowledged, 1, 'actual native response precedes mutation');
    assert.equal(model.head, replacement, 'canonical replay observes fresh cached parent identity');
    assert.deepEqual(Object.keys(model.versions), ['1.0.0']);
  } finally {
    recovery.requestRustRecovery = original;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('custom reset loader retains canonical error timing and leaves head/version state untouched', async () => {
  const { createMergeFixture } = require('./merge-history-fixture.cjs');
  const { Scope } = installed('@teambit/legacy.scope');
  const { Ref, ModelComponent } = installed('@teambit/objects');
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS;
  const oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    for (const flag of ['off', 'on']) {
      process.env.BIT_RUST_CLIENT_VCS = flag;
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-custom-reset-'));
      try {
        const f = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
        const headHash = await f.publishRemoteSibling();
        const scope = await Scope.load(directory, false);
        const head = new Ref(headHash);
        const model = ModelComponent.from({
          name: 'component',
          scope: 'qualification.merge',
          versions: { '1.0.0': new Ref(f.baseRef), '1.0.1': head },
          head,
        });
        let calls = 0;
        const failure = new Error('custom version loading failed');
        model.loadVersion = async () => {
          calls++;
          throw failure;
        };
        await assert.rejects(
          withRustSnapshotOperation(() =>
            scope.sources.removeComponentVersions(model, [head], ['1.0.1'], undefined, true)
          ),
          (error) => error === failure
        );
        assert.equal(calls, 1, 'custom loader called exactly once by canonical path');
        assert.equal(model.head, head);
        assert.deepEqual(Object.keys(model.versions), ['1.0.0', '1.0.1']);
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  } finally {
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  }
});
