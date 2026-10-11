const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { root, source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_WORKSPACE_COMPARISON_COMPILED === '1';
const componentSources = compiled
  ? installed('@teambit/component.sources')
  : source('scopes/component/sources/index.ts');
const SourceFile = componentSources.SourceFile;
const reader = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-reader.js'))
  : source('scopes/component/sources/rust-workspace-reader.ts');
const { getFilesDiff } = compiled
  ? installed('@teambit/legacy.component-diff')
  : source('components/legacy/component-diff/components-diff.ts');
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
async function setup(t, executable = helper) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-comparison-'));
  const keys = ['BIT_RUST_CLIENT_VCS', 'BIT_RUST_OBJECT_IMPORT'];
  const previous = keys.map((key) => process.env[key]);
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = executable;
  t.after(async () => {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
function file(directory, relative, contents) {
  return new SourceFile({ base: directory, path: path.join(directory, relative), contents: Buffer.from(contents) });
}

test('native workspace reads preserve bytes, order and canonical Linux-EOL Source identity', async (t) => {
  const directory = await setup(t);
  const contents = [
    Buffer.from('a\r\nb\rc\n'),
    Buffer.from([0, 255, 13, 10, 254]),
    Buffer.from('日本語 🚀\r\n'),
    Buffer.alloc(0),
    Buffer.from([255, 13, 10, 254]),
  ];
  const filenames = contents.map((_, index) => path.join(directory, `file-${index}`));
  await Promise.all(filenames.map((filename, index) => fs.writeFile(filename, contents[index])));
  const reads = await reader.readRustWorkspaceFiles(filenames);
  assert.equal(reads.length, contents.length);
  reads.forEach((read, index) => {
    assert.equal(read.path, filenames[index]);
    assert.deepEqual(read.contents, contents[index]);
    assert.equal(read.hash, sha1(contents[index]));
    const vinyl = file(directory, `file-${index}`, contents[index]);
    const canonical = vinyl.toSourceAsLinuxEOL();
    assert.equal(read.linuxHash, canonical.hash().toString());
    reader.registerRustWorkspaceFile(vinyl, read);
    assert.deepEqual(reader.getRustWorkspaceFileDescriptor(vinyl), { path: filenames[index], hash: read.hash });
    assert.deepEqual(reader.getRustWorkspaceSource(vinyl).contents, canonical.contents);
  });
});

test('workspace provenance rejects replaced buffers, in-place mutations, paths and custom Source conversions', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'source');
  await fs.writeFile(filename, 'source\r\n');
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  for (const mutate of [
    (vinyl) => {
      vinyl.contents = Buffer.from('replaced');
    },
    (vinyl) => {
      vinyl.contents[0] = 120;
    },
    (vinyl) => {
      vinyl.path = path.join(directory, 'moved');
    },
    (vinyl) => {
      vinyl.toSourceAsLinuxEOL = () => installed('@teambit/objects').Source.from(Buffer.from('custom'));
    },
  ]) {
    const vinyl = file(directory, 'source', read.contents);
    reader.registerRustWorkspaceFile(vinyl, { ...read, contents: vinyl.contents });
    assert.ok(reader.getRustWorkspaceFileDescriptor(vinyl));
    mutate(vinyl);
    assert.equal(reader.getRustWorkspaceFileDescriptor(vinyl), undefined);
    assert.equal(reader.getRustWorkspaceSource(vinyl), undefined);
  }
});

test('missing, unreadable and disabled native workspace reads decline without partial results', async (t) => {
  const directory = await setup(t);
  const existing = path.join(directory, 'existing');
  await fs.writeFile(existing, 'existing');
  assert.equal(await reader.readRustWorkspaceFiles([existing, path.join(directory, 'missing')]), undefined);
  assert.equal(await reader.readRustWorkspaceFiles([directory]), undefined);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.equal(await reader.readRustWorkspaceFiles([existing]), undefined);
  assert.equal(await reader.scanRustWorkspace(directory, [], false), undefined);
});

test('canonical and native public file diffs preserve EOL, binary, empty, added, deleted and color semantics', async (t) => {
  const directory = await setup(t);
  for (const color of [false, true]) {
    const filesA = [
      file(directory, 'same.js', 'a\r\nb\n'),
      file(directory, 'changed.js', 'one\n'),
      file(directory, 'deleted.js', 'old\n'),
      file(directory, 'empty.js', ''),
      file(directory, 'binary.bin', Buffer.from([0, 1, 2, 255])),
    ];
    const filesB = [
      file(directory, 'same.js', 'a\nb\n'),
      file(directory, 'changed.js', 'two\n'),
      file(directory, 'added.js', 'new\n'),
      file(directory, 'empty.js', ''),
      file(directory, 'binary.bin', Buffer.from([0, 1, 3, 255])),
    ];
    for (const [side, files] of [
      ['a', filesA],
      ['b', filesB],
    ]) {
      const base = path.join(directory, side);
      await fs.mkdir(base, { recursive: true });
      for (const vinyl of files) {
        vinyl.updatePaths({ newBase: base });
        await fs.writeFile(vinyl.path, vinyl.contents);
      }
      const reads = await reader.readRustWorkspaceFiles(files.map((vinyl) => vinyl.path));
      reads.forEach((read, index) => reader.registerRustWorkspaceFile(files[index], read));
    }
    process.env.BIT_RUST_CLIENT_VCS = 'off';
    const canonical = await getFilesDiff(filesA, filesB, '1.0.0', '1.0.1', 'relative', color);
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    const native = await getFilesDiff(filesA, filesB, '1.0.0', '1.0.1', 'relative', color);
    assert.deepEqual(native, canonical);
    assert.equal(native.find((result) => result.filePath === 'same.js').status, 'UNCHANGED');
    const raw = await reader.getRustFilesDiff(filesA, filesB, 'relative', color);
    assert.ok(raw && raw.length === canonical.length, 'test must exercise native raw diff production');
  }
});

test('custom Source conversion hooks preserve public diff output and canonical invocation counts', async (t) => {
  const directory = await setup(t);
  const results = [];
  const counts = [];
  for (const enabled of [false, true]) {
    const left = file(directory, 'custom.js', 'left\r\n');
    const right = file(directory, 'custom.js', 'right\n');
    let calls = 0;
    const conversion = left.toSourceAsLinuxEOL;
    left.toSourceAsLinuxEOL = function () {
      assert.equal(this, left);
      calls++;
      return conversion.call(this);
    };
    process.env.BIT_RUST_CLIENT_VCS = enabled ? 'on' : 'off';
    results.push(await getFilesDiff([left], [right], 'v', 'v', 'relative', false));
    counts.push(calls);
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal(counts[0], counts[1]);
});

test('missing native helper preserves canonical public diff results', async (t) => {
  const directory = await setup(t, path.join(os.tmpdir(), 'missing-workspace-reader'));
  const a = [file(directory, 'source.js', 'one\n')];
  const b = [file(directory, 'source.js', 'two\n')];
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const expected = await getFilesDiff(a, b, 'v1', 'v2', 'relative', false);
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  assert.deepEqual(await getFilesDiff(a, b, 'v1', 'v2', 'relative', false), expected);
  assert.equal(await reader.readRustWorkspaceFiles([path.join(directory, 'missing')]), undefined);
});

test(
  'a crashed workspace helper declines reads and leaves canonical diff output intact',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await setup(t);
    const executable = path.join(directory, 'crashed-helper');
    await fs.writeFile(executable, '#!/usr/bin/env node\nprocess.stdin.once("data",()=>process.exit(7));\n', {
      mode: 0o755,
    });
    process.env.BIT_RUST_OBJECT_IMPORT = executable;
    const filename = path.join(directory, 'source.js');
    await fs.writeFile(filename, 'source\n');
    assert.equal(await reader.readRustWorkspaceFiles([filename]), undefined);
    const a = [file(directory, 'source.js', 'one\n')];
    const b = [file(directory, 'source.js', 'two\n')];
    process.env.BIT_RUST_CLIENT_VCS = 'off';
    const expected = await getFilesDiff(a, b, 'v1', 'v2', 'relative', false);
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    assert.deepEqual(await getFilesDiff(a, b, 'v1', 'v2', 'relative', false), expected);
  }
);

test('native workspace reads strip a UTF-8 BOM while retaining the raw disk identity', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'bom.js');
  const disk = Buffer.from('\ufeffhello\r\n');
  await fs.writeFile(filename, disk);
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  assert.deepEqual(read.contents, Buffer.from('hello\r\n'));
  assert.equal(read.hash, sha1(disk));
  const vinyl = file(directory, 'bom.js', read.contents);
  assert.equal(read.linuxHash, vinyl.toSourceAsLinuxEOL().hash().toString());
  reader.registerRustWorkspaceFile(vinyl, read);
  assert.equal(reader.getRustWorkspaceSource(vinyl).hash().toString(), read.linuxHash);
});

test('workspace Source identities revert to ordinary hashing after body mutation', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'source.js');
  await fs.writeFile(filename, 'one\r\n');
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  const vinyl = file(directory, 'source.js', read.contents);
  reader.registerRustWorkspaceFile(vinyl, read);
  const sourceObject = reader.getRustWorkspaceSource(vinyl);
  assert.equal(sourceObject.hash().toString(), read.linuxHash);
  sourceObject.contents[0] = 120;
  assert.equal(sourceObject.hash().toString(), sha1(sourceObject.contents));
  assert.notEqual(sourceObject.hash().toString(), read.linuxHash);
});

test('native scanning preserves dot and Unicode files while excluding owned folders and component roots', async (t) => {
  const directory = await setup(t);
  for (const name of [
    'nested/a.js',
    '.hidden',
    '日本語.ts',
    '.bitmap',
    '.bitmap-old',
    '.git/config',
    '.bit/objects/object',
    'node_modules/package/index.js',
    '.bitTmp/temporary',
    'excluded/source.js',
  ]) {
    const filename = path.join(directory, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, 'source');
  }
  const workspace = await reader.scanRustWorkspace(directory, [path.join(directory, 'excluded')], true);
  assert.deepEqual(
    workspace.map((filename) => path.relative(directory, filename).split(path.sep).join('/')).sort(),
    ['.bitmap', '.bitmap-old', '.hidden', 'nested/a.js', '日本語.ts'].sort()
  );
  const component = await reader.scanRustWorkspace(directory, [path.join(directory, 'excluded')], false);
  assert.ok(!component.includes(path.join(directory, '.bitmap')));
});

test(
  'native scanning declines symlinks so canonical scanning retains platform behavior',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await setup(t);
    await fs.mkdir(path.join(directory, 'target'));
    await fs.writeFile(path.join(directory, 'target/source'), 'source');
    await fs.symlink(path.join(directory, 'target'), path.join(directory, 'link'));
    assert.equal(await reader.scanRustWorkspace(directory, [], false), undefined);
  }
);

test('native version identity comparison detects metadata changes and preserves equality', async (t) => {
  await setup(t);
  const original = JSON.stringify({
    files: [{ hash: 'a'.repeat(40), relativePath: 'index.js' }],
    mainFile: 'index.js',
    dependencies: [],
  });
  const metadataChanged = JSON.stringify({
    files: [{ hash: 'a'.repeat(40), relativePath: 'index.js' }],
    mainFile: 'index.js',
    dependencies: [{ id: 'dependency@1.0.0' }],
  });
  assert.equal(await reader.compareRustVersionIds(original, original), false);
  assert.equal(await reader.compareRustVersionIds(original, metadataChanged), true);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.equal(await reader.compareRustVersionIds(original, metadataChanged), undefined);
});

test(
  'workspace read responses with altered paths are rejected and the helper is reaped',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await setup(t);
    const filename = path.join(directory, 'source.js');
    await fs.writeFile(filename, 'source');
    const executable = path.join(directory, 'wrong-read-helper');
    const record = path.join(directory, 'helper-pid');
    await fs.writeFile(
      executable,
      '#!/usr/bin/env node\nconst fs=require("node:fs");process.stdin.once("data",bytes=>{fs.writeFileSync(' +
        JSON.stringify(record) +
        ',String(process.pid));process.stdout.write(JSON.stringify({version:1,id:bytes.readUInt32BE(4),completed:1,skipped:[],failed:false,data:{files:[{path:' +
        JSON.stringify(path.join(directory, 'other.js')) +
        ',contents:"736f75726365",hash:"' +
        '1'.repeat(40) +
        '",linuxHash:"' +
        '2'.repeat(40) +
        '"}]}})+"\\n");});setInterval(()=>{},1000);\n',
      { mode: 0o755 }
    );
    process.env.BIT_RUST_OBJECT_IMPORT = executable;
    assert.equal(await reader.readRustWorkspaceFiles([filename]), undefined);
    const pid = Number(await fs.readFile(record, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(await fs.readFile(filename, 'utf8'), 'source');
  }
);

test('custom Source hashing and file contents accessors cannot reuse native provenance', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'source.js');
  await fs.writeFile(filename, 'source\n');
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  const vinyl = file(directory, 'source.js', read.contents);
  reader.registerRustWorkspaceFile(vinyl, read);
  let calls = 0;
  const { Source, Ref } = installed('@teambit/objects');
  const hash = Source.prototype.hash;
  Source.prototype.hash = function () {
    calls++;
    return new Ref('f'.repeat(40));
  };
  try {
    assert.equal(reader.getRustWorkspaceFileDescriptor(vinyl), undefined);
    assert.equal(reader.getRustWorkspaceSource(vinyl), undefined);
    assert.equal(vinyl.toSourceAsLinuxEOL().hash().toString(), 'f'.repeat(40));
    assert.equal(calls, 1);
  } finally {
    Source.prototype.hash = hash;
  }
  let reads = 0;
  Object.defineProperty(vinyl, 'contents', {
    configurable: true,
    get() {
      reads++;
      return read.contents;
    },
  });
  assert.equal(reader.getRustWorkspaceFileDescriptor(vinyl), undefined);
  assert.equal(reads, 0, 'provenance checks must not invoke custom contents getters');
});

test('changed disk bytes invalidate native diff descriptors without changing loaded canonical buffers', async (t) => {
  const directory = await setup(t);
  const files = [];
  for (const [side, contents] of [
    ['a', 'one\n'],
    ['b', 'two\n'],
  ]) {
    const base = path.join(directory, side);
    await fs.mkdir(base);
    const vinyl = file(base, 'source.js', contents);
    await fs.writeFile(vinyl.path, vinyl.contents);
    const [read] = await reader.readRustWorkspaceFiles([vinyl.path]);
    reader.registerRustWorkspaceFile(vinyl, read);
    files.push(vinyl);
  }
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const expected = await getFilesDiff([files[0]], [files[1]], 'v1', 'v2', 'relative', false);
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  await fs.writeFile(files[1].path, 'changed after loading\n');
  assert.equal(await reader.getRustFilesDiff([files[0]], [files[1]], 'relative', false), undefined);
  assert.deepEqual(await getFilesDiff([files[0]], [files[1]], 'v1', 'v2', 'relative', false), expected);
  assert.equal(files[1].contents.toString(), 'two\n');
});

test('workspace scanning treats nested ownership exclusions as literal directory boundaries', async (t) => {
  const directory = await setup(t);
  await fs.writeFile(path.join(directory, '.git'), 'gitdir: ../owned-worktree');
  for (const name of ['app/[slug]/owned.js', 'app/l/retained.js', 'app/[slug]-sibling/retained.js']) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), 'source');
  }
  const paths = await reader.scanRustWorkspace(directory, [path.join(directory, 'app/[slug]')], true);
  assert.deepEqual(paths.map((filename) => path.relative(directory, filename).split(path.sep).join('/')).sort(), [
    'app/[slug]-sibling/retained.js',
    'app/l/retained.js',
  ]);
});

test('native SourceFile construction preserves canonical cwd, stat metadata and extended properties', async (t) => {
  const directory = await setup(t);
  const base = path.join(directory, 'component');
  await fs.mkdir(base);
  const filename = path.join(base, 'source.js');
  await fs.writeFile(filename, '\ufeffsource\r\n');
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  const factory =
    componentSources.sourceFileFromWorkspaceRead ||
    source('scopes/component/sources/source-file.ts').sourceFileFromWorkspaceRead;
  const canonical = SourceFile.load(filename, base, directory, { test: true, custom: 'extension property' });
  const native = factory(read, base, directory, { test: true, custom: 'extension property' });
  assert.deepEqual(
    {
      cwd: native.cwd,
      base: native.base,
      path: native.path,
      relative: native.relative,
      contents: native.contents,
      test: native.test,
      custom: native.custom,
    },
    {
      cwd: canonical.cwd,
      base: canonical.base,
      path: canonical.path,
      relative: canonical.relative,
      contents: canonical.contents,
      test: canonical.test,
      custom: canonical.custom,
    }
  );
  assert.equal(native.stat.size, canonical.stat.size);
  assert.equal(native.stat.mode, canonical.stat.mode);
  assert.equal(native.stat.mtimeMs, canonical.stat.mtimeMs);
  await fs.rm(filename);
  assert.throws(
    () => factory(read, base, directory),
    (error) => error.constructor.name === 'FileSourceNotFound'
  );
});

test('in-flight diff array mutations fall back to the final canonical inventory', async (t) => {
  const directory = await setup(t);
  const filesA = [];
  const filesB = [];
  for (const [side, relative, contents] of [
    ['a', 'source.js', 'old\n'],
    ['b', 'source.js', 'new\n'],
    ['b', 'extra.js', 'added\n'],
  ]) {
    const base = path.join(directory, side);
    await fs.mkdir(base, { recursive: true });
    const PublicSourceFile = installed('@teambit/component.sources').SourceFile;
    const vinyl = new PublicSourceFile({ base, path: path.join(base, relative), contents: Buffer.from(contents) });
    await fs.writeFile(vinyl.path, vinyl.contents);
    const [read] = await reader.readRustWorkspaceFiles([vinyl.path]);
    reader.registerRustWorkspaceFile(vinyl, read);
    installed('@teambit/component.sources').registerRustWorkspaceFile(vinyl, read);
    (side === 'a' ? filesA : filesB).push(vinyl);
  }
  const extra = filesB.pop();
  const cp = require('node:child_process');
  const originalSpawn = cp.spawn;
  let mutated = false;
  cp.spawn = function (executable, ...args) {
    const child = originalSpawn.call(this, executable, ...args);
    if (executable === path.toNamespacedPath(helper)) {
      const originalWrite = child.stdin.write;
      child.stdin.write = function (bytes, ...writeArgs) {
        if (
          Buffer.isBuffer(bytes) &&
          bytes.subarray(0, 4).toString() === 'BWS1' &&
          JSON.parse(bytes.subarray(12).toString()).kind === 'diff'
        ) {
          if (!mutated) {
            mutated = true;
            filesB.push(extra);
          }
        }
        return originalWrite.call(this, bytes, ...writeArgs);
      };
    }
    return child;
  };
  t.after(() => {
    cp.spawn = originalSpawn;
  });
  const actual = await getFilesDiff(filesA, filesB, 'v1', 'v2', 'relative', false);
  assert.equal(mutated, true);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.deepEqual(actual, await getFilesDiff(filesA, filesB, 'v1', 'v2', 'relative', false));
  assert.ok(actual.some((entry) => entry.filePath === 'extra.js'));
});

test('component inventories preserve root rules, nested ignore precedence and literal exclusions in stable order', async (t) => {
  const directory = await setup(t);
  const bitmap = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/legacy.bit-map')), 'component-map.js'))
    : source('components/legacy/bit-map/component-map.ts');
  const fixture = {
    '.bitmap': '{}',
    '.gitignore': '.bitmap\n*.tmp\n',
    'z.js': '',
    'a/deep/source.js': '',
    'a/root.js': '',
    'a/.gitignore': '!keep.tmp\n',
    'a/keep.tmp': '',
    'a/drop.tmp': '',
    'owned/[slug]/source.js': '',
    'owned/[slug]-sibling/source.js': '',
    'component/.bitmap': '{}',
    'component/.bitignore': 'drop.js\n',
    'component/index.js': '',
    'component/nested/source.js': '',
    'component/drop.js': '',
    'component/package.json': '{}',
    'node_modules/dep/source.js': '',
    '.bit/cache/source.js': '',
  };
  await Promise.all(
    Object.entries(fixture).map(async ([relative, contents]) => {
      const filename = path.join(directory, relative);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, contents);
    })
  );
  const cp = require('node:child_process');
  const originalSpawn = cp.spawn;
  let scans = 0;
  cp.spawn = function (executable, ...args) {
    const child = originalSpawn.call(this, executable, ...args);
    if (executable === path.toNamespacedPath(helper)) {
      const originalWrite = child.stdin.write;
      child.stdin.write = function (bytes, ...writeArgs) {
        if (
          Buffer.isBuffer(bytes) &&
          bytes.subarray(0, 4).toString() === 'BWS1' &&
          JSON.parse(bytes.subarray(12).toString()).kind === 'scan'
        )
          scans++;
        return originalWrite.call(this, bytes, ...writeArgs);
      };
    }
    return child;
  };
  t.after(() => {
    cp.spawn = originalSpawn;
  });
  for (const [dir, excludes, trackAllFiles] of [
    ['.', ['owned/[slug]', 'component'], false],
    ['component', [], false],
    ['component', [], true],
  ]) {
    const ignore = await bitmap.getGitIgnoreHarmony(directory, undefined, trackAllFiles);
    process.env.BIT_RUST_CLIENT_VCS = 'off';
    const expected = await bitmap.getFilesByDir(dir, directory, ignore, excludes, trackAllFiles);
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    const scansBefore = scans;
    assert.deepEqual(await bitmap.getFilesByDir(dir, directory, ignore, excludes, trackAllFiles), expected);
    assert.equal(scans, scansBefore, 'bootstrap inventory must avoid an unowned helper');
    const actual = await installed('@teambit/component.sources').withWorkspacePersistence(() =>
      bitmap.getFilesByDir(dir, directory, ignore, excludes, trackAllFiles)
    );
    assert.deepEqual(actual, expected);
    assert.equal(scans, scansBefore + 1, 'owned inventory must actually use the native scanner');
    const names = actual.map((entry) => entry.relativePath);
    assert.deepEqual(names, [...names].sort());
    assert.ok(!names.some((name) => name.endsWith('drop.js') || name.endsWith('drop.tmp')));
    if (dir === '.') {
      assert.ok(names.includes('.bitmap'));
      assert.ok(names.includes('a/keep.tmp'));
      assert.ok(names.includes('owned/[slug]-sibling/source.js'));
      assert.ok(!names.includes('owned/[slug]/source.js'));
    } else {
      assert.ok(!names.includes('.bitmap'));
      assert.equal(names.includes('package.json'), trackAllFiles);
    }
  }
});

test('native identities reject prototype Version hashing and shared BitObject hashing hooks', async (t) => {
  await setup(t);
  const objects = installed('@teambit/objects');
  const versionModule = compiled ? objects : source('scopes/scope/objects/models/version.ts');
  const Version = compiled ? objects.Version : versionModule.default;
  const canCompare = versionModule.canCompareVersionNatively;
  const version = Object.create(Version.prototype);
  assert.equal(canCompare(version), true);
  const originalCalculateHash = Version.prototype.calculateHash;
  try {
    Version.prototype.calculateHash = function () {
      return originalCalculateHash.call(this);
    };
    assert.equal(canCompare(version), false);
  } finally {
    Version.prototype.calculateHash = originalCalculateHash;
  }
  const versionBitObject = compiled ? objects.BitObject : source('scopes/scope/objects/objects/index.ts').BitObject;
  const originalVersionMakeHash = versionBitObject.makeHash;
  const originalMakeHash = objects.BitObject.makeHash;
  try {
    versionBitObject.makeHash = function (...args) {
      return originalVersionMakeHash.apply(this, args);
    };
    objects.BitObject.makeHash = function (...args) {
      return originalMakeHash.apply(this, args);
    };
    assert.equal(canCompare(version), false);
    assert.equal(objects.canHashSourceNatively(), false);
  } finally {
    objects.BitObject.makeHash = originalMakeHash;
    versionBitObject.makeHash = originalVersionMakeHash;
  }
  assert.equal(canCompare(version), true);
  assert.equal(objects.canHashSourceNatively(), true);
});

test('snapshot Source provenance preserves raw disk and normalized hashes across read-only hydration', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'snapshot.js');
  const bytes = Buffer.from('first\r\nsecond\r\n');
  await fs.writeFile(filename, bytes);
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  const vinyl = file(directory, 'snapshot.js', read.contents);
  reader.registerRustWorkspaceFile(vinyl, read);
  const snapshot = reader.getRustWorkspaceSource(vinyl);
  const getDescriptor = componentSources.getRustSnapshotSourceDescriptor;
  assert.deepEqual(getDescriptor(snapshot), {
    path: filename,
    hash: sha1(bytes),
    sourceHash: sha1(Buffer.from('first\nsecond\n')),
  });
  assert.equal(snapshot.hash().toString(), read.linuxHash);
  assert.ok(getDescriptor(snapshot), 'hashing does not hydrate a native Source');
  assert.deepEqual(snapshot.contents, Buffer.from('first\nsecond\n'));
  assert.ok(getDescriptor(snapshot), 'read-only body exposure retains guarded native disk provenance');
  assert.equal(Object.hasOwn(snapshot, 'hash'), false, 'hydrated Sources inherit canonical hashing');
  snapshot.contents[0] = 88;
  assert.equal(getDescriptor(snapshot), undefined, 'in-place Source body mutation invalidates provenance');
});

test('unhydrated native Sources preserve canonical LF and binary Buffer aliases after mutation', async (t) => {
  const directory = await setup(t);
  for (const [index, bytes] of [Buffer.from('original\n'), Buffer.from([0, 255, 13, 10, 254])].entries()) {
    const filename = path.join(directory, `alias-${index}`);
    await fs.writeFile(filename, bytes);
    const [read] = await reader.readRustWorkspaceFiles([filename]);
    const vinyl = file(directory, `alias-${index}`, read.contents);
    const canonical = vinyl.toSourceAsLinuxEOL();
    assert.equal(canonical.contents, vinyl.contents, 'canonical unchanged/binary normalization aliases the input');
    reader.registerRustWorkspaceFile(vinyl, read);
    const snapshot = reader.getRustWorkspaceSource(vinyl);
    assert.ok(componentSources.getRustSnapshotSourceDescriptor(snapshot));
    vinyl.contents[vinyl.contents.length - 1] = 65;
    assert.equal(componentSources.getRustSnapshotSourceDescriptor(snapshot), undefined);
    assert.equal(snapshot.hash().toString(), canonical.hash().toString());
    assert.equal(snapshot.contents, vinyl.contents);
    assert.deepEqual(snapshot.contents, canonical.contents);
  }
});

test('unhydrated native CRLF Sources retain the canonical creation-time normalized copy', async (t) => {
  const directory = await setup(t);
  const filename = path.join(directory, 'normalized.js');
  await fs.writeFile(filename, 'original\r\n');
  const [read] = await reader.readRustWorkspaceFiles([filename]);
  const vinyl = file(directory, 'normalized.js', read.contents);
  const canonical = vinyl.toSourceAsLinuxEOL();
  assert.notEqual(canonical.contents, vinyl.contents);
  reader.registerRustWorkspaceFile(vinyl, read);
  const snapshot = reader.getRustWorkspaceSource(vinyl);
  assert.ok(componentSources.getRustSnapshotSourceDescriptor(snapshot));
  // Mutate before any native Source body access; normalization must still reflect creation time.
  vinyl.contents[0] = 88;
  assert.equal(componentSources.getRustSnapshotSourceDescriptor(snapshot), undefined);
  assert.equal(snapshot.hash().toString(), canonical.hash().toString());
  assert.deepEqual(snapshot.contents, Buffer.from('original\n'));
  assert.deepEqual(snapshot.contents, canonical.contents);
  assert.notEqual(snapshot.contents, vinyl.contents);
});
