const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const trace = path.join(__dirname, 'import-trace.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-import-trace-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const metrics = path.join(directory, 'metrics.json');
  const module = path.join(directory, 'objects-fixture.cjs');
  fs.writeFileSync(
    module,
    `
    class ObjectsWritable {
      async writeObjectToFs(object) { if (object.error) throw object.error; return object.value; }
    }
    class ObjectFetcher { async fetchFromRemoteAndWrite(value) { return value; } }
    module.exports = { ObjectsWritable, ObjectFetcher };
  `
  );
  return { directory, metrics, module };
}
function execute(files, code, env = {}) {
  const childEnv = { ...process.env, BIT_IMPORT_TRACE: files.metrics };
  delete childEnv.BIT_IMPORT_TRACE_OWNER;
  Object.assign(childEnv, env);
  const run = spawnSync(process.execPath, ['--require', trace, '-e', code], { encoding: 'utf8', env: childEnv });
  assert.equal(run.status, 0, run.stderr);
  return fs.existsSync(files.metrics) ? JSON.parse(fs.readFileSync(files.metrics)) : undefined;
}
test('diagnostic wrapping preserves async values/error identity and counts repeated module loads once', (t) => {
  const files = fixture(t);
  const metrics = execute(
    files,
    `
    const assert = require('node:assert/strict');
    const { ObjectsWritable } = require(${JSON.stringify(files.module)});
    require(${JSON.stringify(files.module)});
    (async () => {
      const object = new ObjectsWritable();
      assert.equal(await object.writeObjectToFs({ buffer: Buffer.from('data'), value: 42 }), 42);
      const error = new Error('original error');
      await assert.rejects(object.writeObjectToFs({ buffer: Buffer.alloc(0), error }), actual => actual === error);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `,
    { BIT_IMPORT_TRACE_OWNER: String(process.pid) }
  );
  // A non-owner must not produce a misleading empty or partial trace.
  assert.equal(metrics, undefined);
  const actual = execute(
    files,
    `
    require(${JSON.stringify(trace)});
    const { ObjectsWritable } = require(${JSON.stringify(files.module)});
    (async () => {
      const object = new ObjectsWritable();
      const assert = require('node:assert/strict');
      assert.equal(await object.writeObjectToFs({ buffer: Buffer.from('data'), value: 42 }), 42);
      const error = new Error('original error');
      await assert.rejects(object.writeObjectToFs({ buffer: Buffer.alloc(0), error }), actual => actual === error);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `
  );
  assert.equal(actual.stages.streamObjectProcessing.calls, 2);
  assert.equal(actual.receivedObjects, 1);
  assert.equal(actual.receivedCompressedBytes, 4);
});
test('forked analytics-style children inherit owner and cannot overwrite the command trace', (t) => {
  const files = fixture(t);
  const child = path.join(files.directory, 'child.cjs');
  fs.writeFileSync(child, `process.on('disconnect',()=>{});`);
  const metrics = execute(
    files,
    `
    const { ObjectsWritable } = require(${JSON.stringify(files.module)});
    new ObjectsWritable().writeObjectToFs({ buffer: Buffer.from('data') }).then(() => {
      const child = require('node:child_process').fork(${JSON.stringify(child)}, [], { stdio: 'ignore' });
      child.disconnect();
    });
  `
  );
  assert.equal(metrics.receivedObjects, 1);
  assert.equal(metrics.stages.streamObjectProcessing.calls, 1);
});
test('production tar diagnostics preserve result/error identity and distinguish native from fallback operations', (t) => {
  const files = fixture(t);
  const module = path.join(files.directory, 'rust-tar-fixture.cjs');
  fs.writeFileSync(
    module,
    `module.exports = {
    async importTarStream(value) { if (value instanceof Error) throw value; return value; },
    async readTarBatches(value) { return value; },
    async readProgressiveTarBatches(value) { return value; }
  };`
  );
  const actual = execute(
    files,
    `
    const assert = require('node:assert/strict');
    const api = require(${JSON.stringify(module)});
    (async () => {
      const result = {objects:5,nativeSources:4,fallback:false};
      assert.equal(await api.importTarStream(result),result);
      await api.importTarStream({objects:2,nativeSources:0,fallback:true});
      const error = new Error('original tar error');
      await assert.rejects(api.importTarStream(error),value=>value===error);
      await api.readTarBatches({batches:3});
      await api.readProgressiveTarBatches({batches:2});
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `
  );
  assert.deepEqual(actual.tar, { operations: 2, objects: 7, nativeSources: 4, fallbacks: 1, batches: 5 });
  assert.equal(actual.stages.nativeTarIntake.calls, 3);
  assert.equal(actual.stages.nativeTarProtocol.calls, 2);
  assert.equal(Object.keys(actual.modules).length, 1);
});

test('tar intake inflation attribution separates later canonical repository reads', (t) => {
  const files = fixture(t);
  const module = path.join(files.directory, 'objects-parse-fixture.cjs');
  fs.writeFileSync(
    module,
    `module.exports = { BitObject: {
    async parseObjectWithSize(bytes, filename) {
      return { object: { getType: () => 'Version' } };
    }
  } };`
  );
  const actual = execute(
    files,
    `
    const { BitObject } = require(${JSON.stringify(module)});
    (async () => {
      await BitObject.parseObjectWithSize(Buffer.alloc(0));
      await BitObject.parseObjectWithSize(Buffer.alloc(0), '/repository/objects/hash');
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `
  );
  assert.deepEqual(actual.inflation, { incoming: 1, repository: 1 });
  assert.equal(actual.stages.legacyParse.calls, 2);
  assert.deepEqual(actual.objectTypes, { Version: 2 });
});

test('fine merge/index diagnostics preserve synchronous values/errors and count policy work separately', (t) => {
  const files = fixture(t);
  fs.writeFileSync(
    files.module,
    `
    class ScopeIndex { addMany(value) { if(value instanceof Error) throw value; return value; } async write() { return 7; } }
    class ModelComponentMerger { async merge() { return 9; } }
    class VersionHistory { merge(value) { return value; } }
    class SourceRepository { async _findComponent(value) { return value; } }
    class Repository { async load(value) { return value; } }
    module.exports = { ScopeIndex, ModelComponentMerger, VersionHistory, SourceRepository, Repository };
  `
  );
  const actual = execute(
    files,
    `
    const assert=require('node:assert/strict');
    const {ScopeIndex,ModelComponentMerger,VersionHistory,SourceRepository,Repository}=require(${JSON.stringify(files.module)});
    (async()=>{
      const sources=new SourceRepository(), repo=new Repository();
      assert.equal(await sources._findComponent(undefined),undefined);
      assert.equal(await sources._findComponent(42),42);
      assert.equal(await repo.load(undefined),undefined);
      assert.equal(await repo.load(42),42);
      const index=new ScopeIndex();
      assert.equal(index.addMany(false),false);
      const error=new Error('index failure');
      assert.throws(()=>index.addMany(error), actual=>actual===error);
      assert.equal(await index.write(),7);
      assert.equal(await new ModelComponentMerger().merge(),9);
      const input={versions:[]};assert.equal(new VersionHistory().merge(input),input);
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `
  );
  assert.deepEqual(actual.lookupResults, { repository: { found: 1, missing: 1 }, component: { found: 1, missing: 1 } });
  assert.equal(actual.stages.scopeIndexAdd.calls, 2);
  assert.equal(actual.stages.scopeIndexWrite.calls, 1);
  assert.equal(actual.stages.modelComponentMergePolicy.calls, 1);
  assert.equal(actual.stages.versionHistoryMergePolicy.calls, 1);
});

test('Version diagnostics separate persistence parsing without changing eligibility or errors', (t) => {
  const files = fixture(t);
  fs.writeFileSync(
    files.module,
    `
    class BitObject { serialize(){return this.toBuffer();} compressWithSize(){return this.serialize();} }
    class Version extends BitObject {
      constructor(value){super();this.value=value;this.validateVersion();}
      static parse(value){if(value==='bad')throw global.originalError;return new Version(value);}
      validateVersion(){}
      validate(){}
      toObject(){return {value:this.value};}
      validateBeforePersisting(value){const parsed=Version.parse(value);parsed.validate();}
      toBuffer(){const value=JSON.stringify(this.toObject());this.validateBeforePersisting(value);return Buffer.from(value);}
    }
    module.exports={BitObject,Version};
  `
  );
  const actual = execute(
    files,
    `
    const assert=require('node:assert/strict');
    const {BitObject,Version}=require(${JSON.stringify(files.module)});
    require(${JSON.stringify(files.module)});
    const version=Version.parse('data');
    assert.equal(version.serialize,BitObject.prototype.serialize);
    assert.equal(version.compressWithSize,BitObject.prototype.compressWithSize);
    assert.deepEqual(version.serialize(),Buffer.from('{"value":"data"}'));
    global.originalError=new Error('original parse error');
    assert.throws(()=>version.validateBeforePersisting('bad'),error=>error===global.originalError);
    assert.throws(()=>Version.parse('bad'),error=>error===global.originalError);
    assert.ok(Version.parse('after error') instanceof Version);
  `
  );
  assert.equal(actual.stages.versionParseForPersistence.calls, 2);
  assert.equal(actual.stages.versionParseOther.calls, 3);
  assert.equal(actual.stages.versionPersistValidation.calls, 2);
  assert.equal(actual.stages.versionSerialization.calls, 1);
  assert.equal(actual.stages.versionFullValidation.calls, 1);
  assert.equal(actual.version.serializedObjects, 1);
  assert.equal(actual.version.serializedBytes, 16);
});

test('mutable frame diagnostics count frame sizes rather than queued caller requests', (t) => {
  const files = fixture(t);
  fs.writeFileSync(
    files.module,
    `
    class RustObjectImporter {
      async persistMetadata(objects){return this.persistMutableBatch(objects);}
      async persistMutableBatch(objects){return objects.map(object=>object.buffer.length);}
    }
    module.exports={RustObjectImporter};
  `
  );
  const actual = execute(
    files,
    `
    const assert=require('node:assert/strict');
    const {RustObjectImporter}=require(${JSON.stringify(files.module)});
    (async()=>{
      const writer=new RustObjectImporter();const object={buffer:Buffer.from('abc')};
      assert.deepEqual(await writer.persistMetadata([object]),[3]);
      assert.deepEqual(await writer.persistMetadata([object,object]),[3,3]);
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `
  );
  assert.deepEqual(actual.mutableFrames, { counts: { 1: 1, 2: 1 }, serializedBytes: 9 });
  assert.equal(actual.stages.nativeMutableFrame.calls, 2);
});

test('CPU profile belongs to the command and forked children cannot overwrite it', (t) => {
  const files = fixture(t);
  const profile = path.join(files.directory, 'command.cpuprofile');
  const preload = path.join(__dirname, 'import-cpu-profile.cjs');
  const child = path.join(files.directory, 'child.cjs');
  fs.writeFileSync(
    child,
    'function childOnlyWork(){const end=Date.now()+50;while(Date.now()<end){Math.sqrt(Math.random());}} childOnlyWork();'
  );
  const env = { ...process.env, BIT_IMPORT_CPU_PROFILE: profile };
  delete env.BIT_IMPORT_CPU_PROFILE_OWNER;
  const run = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      '-e',
      `
    function owningCommandWork(){const end=Date.now()+100;while(Date.now()<end){Math.sqrt(Math.random());}}
    owningCommandWork();
    require('node:child_process').fork(${JSON.stringify(child)},[],{stdio:'ignore'});
  `,
    ],
    { env, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  const actual = JSON.parse(fs.readFileSync(profile));
  assert.ok(actual.samples.length);
  assert.equal(actual.samples.length, actual.timeDeltas.length);
  assert.ok(actual.nodes.some((node) => node.callFrame.functionName === 'owningCommandWork'));
  assert.ok(!actual.nodes.some((node) => node.callFrame.functionName === 'childOnlyWork'));
});

test('recovery diagnostics distinguish an accepted request from completed filesystem steps', (t) => {
  const files = fixture(t);
  const helper = path.join(files.directory, 'recovery-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.once('data', () => {
    process.stdout.write(JSON.stringify({version:1,id:1,completed:1,skipped:[],failed:false,
      data:{completed:0,nextIndex:0,failed:true}})+'\\n');
    process.stdin.resume();
  });`
  );
  const metrics = execute(
    files,
    `
    const child = require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
    const body=Buffer.from(JSON.stringify({kind:'recoveryAdvance',token:'a'.repeat(40),count:2}));
    const frame=Buffer.alloc(12+body.length);frame.write('BMT1');frame.writeUInt32BE(1,4);
    frame.writeUInt32BE(body.length,8);body.copy(frame,12);
    child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
  `
  );
  assert.deepEqual(metrics.mergeState.recoveryAdvance, {
    frames: 1,
    files: 1,
    completed: 1,
    failed: 0,
    stepsCompleted: 0,
    dataFailed: 1,
  });
  assert.equal(metrics.persistence.helpers, 1);
});

test('checkout diagnostics bind token ownership and distinguish request ACKs from partial write prefixes', (t) => {
  const files = fixture(t);
  const helper = path.join(files.directory, 'checkout-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.on('data',frame=>{
    const input=JSON.parse(frame.subarray(12));
    const data=input.kind==='checkoutPrepare'?{token:'b'.repeat(40),files:[{bytes:17}]}:{completed:1,skipped:[],failed:true};
    process.stdout.write(JSON.stringify({version:1,id:frame.readUInt32BE(4),completed:1,skipped:[],failed:false,data})+'\\n');
  });`
  );
  const metrics = execute(
    files,
    `
    const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
    function send(id,input){const body=Buffer.from(JSON.stringify(input));const frame=Buffer.alloc(12+body.length);frame.write('BMT1');frame.writeUInt32BE(id,4);frame.writeUInt32BE(body.length,8);body.copy(frame,12);child.stdin.write(frame);}
    let replies=0;child.stdout.on('data',()=>{if(++replies===1)send(2,{kind:'checkoutMaterialize',token:'b'.repeat(40),files:[{planIndex:0,path:${JSON.stringify(path.join(files.directory, 'output'))}}]});else child.stdin.end();});
    send(1,{kind:'checkoutPrepare',files:[{contents:Buffer.from([0,255,1])}]});
  `
  );
  assert.deepEqual(metrics.mergeState.checkoutPrepare.helperIds, [1]);
  assert.deepEqual(metrics.mergeState.checkoutPrepare.tokens, [{ token: 'b'.repeat(40), helperId: 1 }]);
  assert.equal(metrics.mergeState.checkoutPrepare.snapshotBytes, 17);
  assert.equal(
    metrics.mergeState.checkoutPrepare.sourceBodyBytes,
    3,
    'observer detects forbidden Buffer JSON payloads'
  );
  assert.equal(metrics.mergeState.checkoutMaterialize.completed, 1);
  assert.equal(metrics.mergeState.checkoutMaterialize.stepsCompleted, 1);
  assert.equal(metrics.mergeState.checkoutMaterialize.dataFailed, 1);
  assert.equal(metrics.mergeState.checkoutMaterialize.sourceBodyBytes, 0);
  assert.deepEqual(
    metrics.workspaceFrames.map(({ magic, kind, helperId }) => ({ magic, kind, helperId })),
    [
      { magic: 'BMT1', kind: 'checkoutPrepare', helperId: 1 },
      { magic: 'BMT1', kind: 'checkoutMaterialize', helperId: 1 },
    ]
  );
});

test('query-only observer preserves defining class descriptors and labels framework counters unobserved', (t) => {
  const files = fixture(t);
  fs.writeFileSync(
    files.module,
    `class Repository { load() { return 'original'; } }
    class ObjectsWritable { writeObjectToFs() { return 'original'; } }
    module.exports = { Repository, ObjectsWritable };`
  );
  const alias = path.join(files.directory, 'query-module-alias');
  fs.symlinkSync(files.directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const metrics = execute(
    files,
    `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const Module = require('node:module');
    const requested = ${JSON.stringify(path.join(files.directory, 'query-module-alias', 'objects-fixture.cjs'))};
    const filename = fs.realpathSync(requested);
    const original = new Module(filename); original.filename = filename;
    original._compile(fs.readFileSync(filename, 'utf8'), filename);
    require.cache[filename] = original;
    const before = Object.getOwnPropertyDescriptors(original.exports.Repository.prototype);
    const writer = original.exports.ObjectsWritable.prototype.writeObjectToFs;
    const loaded = require(requested);
    assert.deepEqual(Object.getOwnPropertyDescriptors(loaded.Repository.prototype), before);
    assert.equal(loaded.ObjectsWritable.prototype.writeObjectToFs, writer);
    assert.equal(new loaded.Repository().load(), 'original');
  `,
    { BIT_IMPORT_TRACE_QUERY_ONLY: '1' }
  );
  assert.equal(metrics.frameworkObservation, 'disabled');
  assert.deepEqual(metrics.stages, {});
});

test('merge protocol diagnostics keep decoder reads distinct from manifests and partial write ACKs', (t) => {
  const files = fixture(t);
  const helper = path.join(files.directory, 'merge-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.on('data',frame=>{
    const input=JSON.parse(frame.subarray(12));
    const data=input.kind==='mergePrepare'?{token:'d'.repeat(40),bodies:Array.from({length:5},()=>({bytes:10})),reads:{versionObjects:1,versionInflatedBytes:120,sourceReads:2,sourceBodyBytes:20}}:{completed:1,skipped:[],failed:true};
    process.stdout.write(JSON.stringify({version:1,id:frame.readUInt32BE(4),completed:1,skipped:[],failed:false,data})+'\\n');
  });`
  );
  const metrics = execute(
    files,
    `
    const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
    function send(id,input){const body=Buffer.from(JSON.stringify(input));const frame=Buffer.alloc(12+body.length);frame.write('BMT1');frame.writeUInt32BE(id,4);frame.writeUInt32BE(body.length,8);body.copy(frame,12);child.stdin.write(frame);}
    let replies=0;child.stdout.on('data',()=>{if(++replies===1)send(2,{kind:'mergeMaterialize',token:'d'.repeat(40),files:[{planIndex:0,path:${JSON.stringify(path.join(files.directory, 'output'))}}]});else child.stdin.end();});
    send(1,{kind:'mergePrepare',files:[{contents:Buffer.from([0,255,1])}]});
  `,
    { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
  );
  assert.equal(metrics.frameworkObservation, 'disabled');
  assert.equal(metrics.mergeState.mergePrepare.retainedBodies, 5);
  assert.equal(metrics.mergeState.mergePrepare.retainedBytes, 50);
  assert.equal(metrics.mergeState.mergePrepare.verifiedReads[0].sourceReads, 2);
  assert.equal(metrics.mergeState.mergePrepare.sourceBodyBytes, 3);
  assert.equal(metrics.mergeState.mergeMaterialize.completed, 1);
  assert.equal(metrics.mergeState.mergeMaterialize.stepsCompleted, 1);
  assert.equal(metrics.mergeState.mergeMaterialize.dataFailed, 1);
  assert.deepEqual(metrics.mergeState.mergePrepare.helperIds, [1]);
});

test('inspection diagnostics retain model hashes in compact and tagged snapshot encodings', (t) => {
  const files = fixture(t),
    helper = path.join(files.directory, 'inspection-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.once('data', () => {process.stdout.write(JSON.stringify({version:1,id:1,completed:1,skipped:[],failed:false,data:{modified:false}})+'\\n');process.stdin.resume();});`
  );
  const hash = 'c'.repeat(40),
    units = (text) => [...text].map((c) => c.charCodeAt(0));
  const object = (name, value, tagged = false) => ({ kind: 'object', value: [[tagged ? units(name) : name, value]] });
  const tagged = object(
    'files',
    { kind: 'array', value: [object('file', { kind: 'string', value: units(hash) }, true)] },
    true
  );
  for (const left of [
    tagged,
    object('files', [object('file', hash)]),
    object('files', [object('file', object('hash', hash))]),
  ]) {
    const metrics = execute(
      files,
      `
      const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
      const body=Buffer.from(JSON.stringify(${JSON.stringify({ kind: 'inspectionCompare', left })}));
      const frame=Buffer.alloc(12+body.length);frame.write('BMT1');frame.writeUInt32BE(1,4);frame.writeUInt32BE(body.length,8);body.copy(frame,12);
      child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
    `,
      { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
    );
    assert.equal(metrics.frameworkObservation, 'disabled');
    assert.equal(metrics.mergeState.inspectionCompare.completed, 1);
    assert.deepEqual(metrics.mergeState.inspectionCompare.modelHashes, [hash]);
  }
});

test('cold diagnostics do not invoke lazy model export getters', (t) => {
  const files = fixture(t);
  fs.writeFileSync(
    files.module,
    `let reads=0; Object.defineProperty(exports,'Version',{enumerable:true,get(){reads++;return class Version{}}});exports.reads=()=>reads;`
  );
  execute(
    files,
    `
    const assert=require('node:assert/strict');
    const value=require(${JSON.stringify(files.module)});
    assert.equal(value.reads(),0);
    assert.equal(typeof Object.getOwnPropertyDescriptor(value,'Version').get,'function');
    assert.equal(value.Version.name,'Version');
    assert.equal(value.reads(),1);
  `,
    { BIT_RUST_CLIENT_VCS: 'on' }
  );
});

test('cold command diagnostics count nested Source bytes in both bridge directions', (t) => {
  const files = fixture(t);
  const helper = path.join(files.directory, 'command-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.once('data', () => {process.stdout.write(JSON.stringify({version:1,id:1,completed:1,skipped:[],failed:false,data:{nested:{body:'reply'}}})+'\\n');process.stdin.resume();});`
  );
  const metrics = execute(
    files,
    `
    const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
    const body=Buffer.from(JSON.stringify({kind:'commandPlan',current:[{nested:{contents:'request'}}]}));
    const frame=Buffer.alloc(12+body.length);frame.write('BWS1');frame.writeUInt32BE(1,4);frame.writeUInt32BE(body.length,8);body.copy(frame,12);
    child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
  `,
    { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
  );
  assert.equal(metrics.workspace.commandPlan.frames, 1);
  assert.equal(metrics.workspace.commandPlan.sourceBodyBytes, 12);
  for (const kind of ['commandPrepare', 'commandFinalize', 'commandApply'])
    assert.equal(metrics.workspace[kind].sourceBodyBytes, 0);
});

test('protocol observation preserves native dependency work and unknown workspace replies', (t) => {
  if (!process.env.BIT_TEST_WORKSPACE_ADDON) return t.skip('actual addon required');
  const files = fixture(t);
  const filename = path.join(files.directory, 'entry.js');
  fs.writeFileSync(filename, "module.exports = {}; require('./dependency');");
  fs.writeFileSync(path.join(files.directory, 'dependency.js'), '');
  const metrics = execute(
    files,
    `
    const assert = require('node:assert/strict');
    const { WorkspaceEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
    const engine = new WorkspaceEngine(2);
    const operations = [
      { kind: 'dependencyScan', request: { version: 1, files: [{ path: ${JSON.stringify(filename)} }] } },
      { kind: 'dependencyResolve', mode: 'commonjs', filename: ${JSON.stringify(filename)}, dependencies: ['./dependency'] },
      { kind: 'dependencyCacheRead', cache: ${JSON.stringify(path.join(files.directory, 'cache'))}, key: 'missing' },
      { kind: 'dependencyCacheFreshness', root: ${JSON.stringify(files.directory)}, files: [], timestamp: Date.now()+10000 },
      { kind: 'futureReadOnlyTest' },
    ];
    (async () => { try {
      for (const [id, operation] of operations.entries()) {
        const body = Buffer.from(JSON.stringify(operation));
        const header = Buffer.alloc(12); header.write('BWS1'); header.writeUInt32BE(id,4); header.writeUInt32BE(body.length,8);
        const result = JSON.parse(await engine.request(Buffer.concat([header,body])));
        assert.equal(result.failed, operation.kind === 'futureReadOnlyTest');
        assert.equal(result.id,id);
      }
    } finally { engine.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
  `,
    { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
  );
  for (const kind of ['dependencyScan', 'dependencyResolve', 'dependencyCacheRead', 'dependencyCacheFreshness']) {
    assert.equal(metrics.workspace[kind].frames, 1);
    assert.equal(metrics.workspace[kind].completed, 1);
    assert.equal(metrics.workspace[kind].failed, 0);
  }
  assert.equal(metrics.workspace.futureReadOnlyTest.failed, 1);
});

test('cold command classification matches stored model paths without classifying scalar version modules', (t) => {
  const files = fixture(t);
  const modules = [
    'component-version/dist/version.js',
    'objects/dist/models/version.js',
    'objects/dist/models/model-component.js',
    'legacy.consumer-component/dist/consumer-component.js',
  ].map((name) => path.join(files.directory, 'node_modules/@teambit', name));
  for (const filename of modules) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, 'module.exports = {};');
  }
  const metrics = execute(files, modules.map((name) => `require(${JSON.stringify(name)});`).join('\n'), {
    BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1',
  });
  assert.deepEqual(
    metrics.loadedCommandModels,
    modules.slice(1).map((filename) => fs.realpathSync(filename))
  );
});

test('cold command classification distinguishes scalar versions from stored models and Consumer hydration', (t) => {
  const files = fixture(t);
  const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
  const installed = require('node:module').createRequire(path.join(installedRoot, 'package.json'));
  try {
    for (const name of ['@teambit/component-id', '@teambit/objects', '@teambit/legacy.consumer-component'])
      installed.resolve(name);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return t.skip('canonical CLI packages are not installed in the minimal scanner test environment');
  }
  const load = `const load = require('node:module').createRequire(${JSON.stringify(path.join(installedRoot, 'package.json'))});`;
  const scalar = execute(files, `${load} load('@teambit/component-id');`, { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' });
  assert.deepEqual(scalar.loadedCommandModels, [], 'component ID version wrappers are not stored Versions');
  const canonical = execute(
    files,
    `${load} void load('@teambit/objects').ModelComponent; void load('@teambit/objects').Version; void load('@teambit/legacy.consumer-component').ConsumerComponent;`,
    { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
  );
  for (const filename of ['model-component.js', 'version.js', 'consumer-component.js'])
    assert.ok(
      canonical.loadedCommandModels.some((entry) => path.basename(entry) === filename),
      filename
    );
  assert.ok(
    canonical.loadedCommandModels
      .filter((entry) => path.basename(entry) === 'version.js')
      .every((entry) => /[/\\]models[/\\]version\.js$/.test(entry))
  );
});

test('persistence hook observation counts invocation without awaiting or changing callback results', (t) => {
  const files = fixture(t);
  files.module = path.join(files.directory, 'repository.cjs');
  fs.writeFileSync(files.module, 'class Repository {}\nmodule.exports = { default: Repository };\n');
  const metrics = execute(
    files,
    `
    const assert = require('node:assert/strict');
    const { default: Repository } = require(${JSON.stringify(files.module)});
    const pending = new Promise(() => {});
    Repository.onPostObjectsPersist = function (value) {
      assert.equal(this, Repository);
      assert.equal(value, 'first');
      return pending;
    };
    assert.equal(Repository.onPostObjectsPersist('first'), pending);
    const failure = new Error('same failure');
    Repository.onPostObjectsPersist = () => { throw failure; };
    assert.throws(() => Repository.onPostObjectsPersist(), error => error === failure);
  `
  );
  assert.equal(metrics.postPersistNotifications, 2);
});

test('successful no-op command counts native persistence notifications without file effect ACKs', (t) => {
  const files = fixture(t);
  const helper = path.join(files.directory, 'notification-helper.cjs');
  fs.writeFileSync(
    helper,
    `process.stdin.once('data', () => {
    process.stdout.write(JSON.stringify({version:1,id:1,completed:0,skipped:[],failed:false,
      data:{applied:true,postPersistNotifications:1}})+'\\n');process.stdin.resume();});`
  );
  const metrics = execute(
    files,
    `
    const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
    const body=Buffer.from(JSON.stringify({kind:'commandApply',token:'retained'}));
    const frame=Buffer.alloc(12+body.length);frame.write('BWS1');frame.writeUInt32BE(1,4);
    frame.writeUInt32BE(body.length,8);body.copy(frame,12);
    child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
  `,
    { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
  );
  assert.equal(metrics.workspace.commandApply.completed, 0);
  assert.equal(metrics.workspace.commandApply.applied, 1);
  assert.deepEqual(metrics.workspaceFrames[0].receipt, { completed: 0, failed: false, applied: true });
  assert.equal(metrics.postPersistNotifications, 1);
});

test('recovery restoration records its own accepted receipt without claiming apply success', (t) => {
  for (const failed of [false, true]) {
    const files = fixture(t);
    const helper = path.join(files.directory, 'restore-helper.cjs');
    fs.writeFileSync(
      helper,
      `process.stdin.once('data', () => {
      process.stdout.write(JSON.stringify({version:1,id:1,completed:0,skipped:[],failed:${failed},data:{restored:true}})+'\\n');process.stdin.resume();});`
    );
    const metrics = execute(
      files,
      `
      const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
      const body=Buffer.from(JSON.stringify({kind:'commandRecoveryRestore',token:'retained'}));
      const frame=Buffer.alloc(12+body.length);frame.write('BWS1');frame.writeUInt32BE(1,4);
      frame.writeUInt32BE(body.length,8);body.copy(frame,12);
      child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
    `,
      { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
    );
    assert.equal(metrics.workspace.commandRecoveryRestore.restored || 0, failed ? 0 : 1);
    assert.deepEqual(metrics.workspaceFrames[0].receipt, { completed: 0, failed, applied: false, restored: true });
    assert.equal(metrics.workspace.commandRecoveryApply.frames, 0);
    assert.equal(metrics.workspace.commandRecoveryApply.applied || 0, 0);
    assert.equal(metrics.workspace.commandApply.applied || 0, 0);
  }
});

test('resolve publication requires an accepted applied receipt, not merely a response', (t) => {
  for (const failed of [false, true]) {
    const files = fixture(t);
    const helper = path.join(files.directory, 'resolve-helper.cjs');
    fs.writeFileSync(
      helper,
      `process.stdin.once('data', () => {
      process.stdout.write(JSON.stringify({version:1,id:1,completed:0,skipped:[],failed:${failed},data:{applied:true,postPersistNotifications:1}})+'\\n');process.stdin.resume();});`
    );
    const metrics = execute(
      files,
      `
      const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
      const body=Buffer.from(JSON.stringify({kind:'commandResolveApply',token:'retained'}));
      const frame=Buffer.alloc(12+body.length);frame.write('BWS1');frame.writeUInt32BE(1,4);
      frame.writeUInt32BE(body.length,8);body.copy(frame,12);
      child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
    `,
      { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
    );
    assert.equal(metrics.workspace.commandResolveApply.applied || 0, failed ? 0 : 1);
    assert.equal(metrics.workspace.commandResolveApply.failed, failed ? 1 : 0);
    assert.equal(metrics.postPersistNotifications, failed ? 0 : 1);
    assert.equal(metrics.workspace.commandApply.applied || 0, 0);
    assert.equal(metrics.workspace.commandRecoveryApply.applied || 0, 0);
  }
});

test('snap publication requires an accepted applied receipt, not merely a response', (t) => {
  for (const failed of [false, true]) {
    const files = fixture(t);
    const helper = path.join(files.directory, 'snap-helper.cjs');
    fs.writeFileSync(
      helper,
      `process.stdin.once('data', () => {
      process.stdout.write(JSON.stringify({version:1,id:1,completed:0,skipped:[],failed:${failed},data:{applied:true,postPersistNotifications:1}})+'\\n');process.stdin.resume();});`
    );
    const metrics = execute(
      files,
      `
      const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(helper)}]);
      const body=Buffer.from(JSON.stringify({kind:'commandSnapApply',token:'retained'}));
      const frame=Buffer.alloc(12+body.length);frame.write('BWS1');frame.writeUInt32BE(1,4);
      frame.writeUInt32BE(body.length,8);body.copy(frame,12);
      child.stdout.once('data',()=>child.stdin.end());child.stdin.write(frame);
    `,
      { BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' }
    );
    assert.equal(metrics.workspace.commandSnapApply.applied || 0, failed ? 0 : 1);
    assert.equal(metrics.workspace.commandSnapApply.failed, failed ? 1 : 0);
    assert.equal(metrics.postPersistNotifications, failed ? 0 : 1);
    assert.equal(metrics.workspace.commandApply.applied || 0, 0);
    assert.equal(metrics.workspace.commandRecoveryApply.applied || 0, 0);
  }
});
