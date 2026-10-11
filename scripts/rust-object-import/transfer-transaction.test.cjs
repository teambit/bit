const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_TRANSFER_COMPILED === '1';
const api = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/export')), 'rust-export-transaction.js'))
  : source('scopes/scope/export/rust-export-transaction.ts');
const events = [];
let cleanupFailure;
const canonical = {
  async validateRemotes(remotes) {
    for (const remote of remotes) await remote.action('ExportValidate', {});
  },
  async persistRemotes(items) {
    for (const item of items) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          item.exportedIds = await item.remote.action('ExportPersist', {});
          break;
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
    }
  },
  async removePendingDirs(remotes) {
    for (const remote of remotes) events.push(`cleanup:${remote.name}`);
    if (cleanupFailure) throw cleanupFailure;
  },
};
api.registerRustExportTransactionFunctions(canonical);
const logger = new Proxy({}, { get: () => () => {} });
async function scenario(loseAfter, replaceOnFailure = false, promisedLaterRow = false) {
  let replaced = false;
  events.length = 0;
  const rows = ['one.scope', 'two.scope'].map((name) => ({
    remote: {
      name,
      async pushMany() {
        events.push(`push:${name}`);
      },
      async action(kind) {
        events.push(`${kind}:${name}`);
        if (replaceOnFailure && !replaced && name === 'one.scope' && kind === 'ExportPersist') {
          replaced = true;
          rows[0] = {
            remote: {
              name: 'replacement.scope',
              async action() {
                throw new Error('replacement must never run');
              },
            },
          };
          throw new Error('retry original remote');
        }
        if (promisedLaterRow && name === 'one.scope' && kind === 'ExportPersist') rows[1] = Promise.resolve(rows[1]);
        return [name + '/component'];
      },
    },
    objectList: { count: () => 1 },
  }));
  const originalRows = rows.slice();
  let revision = 0;
  const replies = [
    { kind: 'push', indices: [0] },
    { kind: 'push', indices: [1] },
    { kind: 'validate', indices: [0, 1] },
    { kind: 'persist', indices: [0], attempt: 1 },
    { kind: 'persist', indices: [1], attempt: 1 },
    { kind: 'done', indices: [] },
  ];
  const original = Module._load;
  Module._load = function (name, parent, main) {
    if (
      parent?.filename.endsWith('rust-export-transaction.ts') ||
      parent?.filename.endsWith('rust-export-transaction.js')
    ) {
      if (name === '@teambit/objects')
        return {
          isRustSnapshotOperation: () => true,
          async requestRustTransfer(request, validate) {
            if (request.kind === 'transferTransactionReceipt') {
              if (!replaceOnFailure) assert.equal(request.success, true);
              revision++;
              if (revision === loseAfter) return undefined;
            }
            const reply = { token: 'a'.repeat(40), revision, directive: replies[revision] };
            assert.equal(validate(reply), true);
            return reply;
          },
        };
      if (name === './export-scope-components') return canonical;
      if (name === '@teambit/legacy.logger') return { logger };
      if (name === '@teambit/legacy.loader') return { loader: logger };
      if (name === '@teambit/scope.remote-actions')
        return { ExportValidate: { name: 'ExportValidate' }, ExportPersist: { name: 'ExportPersist' } };
      if (name === '@teambit/legacy.scope') return { PersistFailed: Error };
    }
    return original.call(this, name, parent, main);
  };
  try {
    assert.equal(await api.tryRustExportTransaction(rows, 'same-client', false, logger), true);
  } finally {
    Module._load = original;
  }
  assert.deepEqual(events, [
    'push:one.scope',
    'push:two.scope',
    'ExportValidate:one.scope',
    'ExportValidate:two.scope',
    'ExportPersist:one.scope',
    ...(replaceOnFailure ? ['ExportPersist:one.scope'] : []),
    'ExportPersist:two.scope',
  ]);
  assert.deepEqual(
    originalRows.map((row) => row.exportedIds),
    [['one.scope/component'], ['two.scope/component']]
  );
}
test('lost helper receipts after each remote effect continue only the remaining transaction suffix', async () => {
  for (const effect of [1, 2, 3, 4, 5]) await scenario(effect);
});

test('lost failed-persist receipt retains the original remote and item across retry replacement hooks', async () => {
  await scenario(4, true);
});

test('second push failure cleans only acknowledged prefix and cleanup errors retain precedence after helper loss', async () => {
  for (const failCleanup of [false, true]) {
    events.length = 0;
    const pushError = new Error('second push failed');
    cleanupFailure = failCleanup ? new Error('cleanup failed') : undefined;
    const expected = cleanupFailure || pushError;
    const rows = ['one.scope', 'two.scope'].map((name, index) => ({
      remote: {
        name,
        async pushMany() {
          events.push(`push:${name}`);
          if (index === 1) throw pushError;
        },
      },
      objectList: { count: () => 1 },
    }));
    let revision = 0;
    const original = Module._load;
    Module._load = function (name, parent, main) {
      if (/rust-export-transaction\.(ts|js)$/.test(parent?.filename || '')) {
        if (name === '@teambit/objects')
          return {
            isRustSnapshotOperation: () => true,
            async requestRustTransfer(input, validate) {
              if (input.kind === 'transferTransactionReceipt') {
                revision++;
                if (revision === 2) {
                  assert.equal(input.success, false);
                  return undefined;
                }
              }
              const reply = { token: 'a'.repeat(40), revision, directive: { kind: 'push', indices: [revision] } };
              assert.equal(validate(reply), true);
              return reply;
            },
          };
        if (name === './export-scope-components') return canonical;
        if (name === '@teambit/legacy.logger') return { logger };
        if (name === '@teambit/legacy.loader') return { loader: logger };
        if (name === '@teambit/scope.remote-actions')
          return { ExportValidate: { name: 'ExportValidate' }, ExportPersist: { name: 'ExportPersist' } };
        if (name === '@teambit/legacy.scope') return { PersistFailed: Error };
      }
      return original.call(this, name, parent, main);
    };
    try {
      await assert.rejects(
        api.tryRustExportTransaction(rows, 'same-client', false, logger),
        (error) => error === expected
      );
    } finally {
      Module._load = original;
      cleanupFailure = undefined;
    }
    assert.deepEqual(events, ['push:one.scope', 'push:two.scope', 'cleanup:one.scope']);
  }
});

test('genuine export defining module registers transaction defaults before operation calls', () => {
  const cp = require('node:child_process');
  const script = `
    const Module = require('node:module');
    const path = require('node:path');
    const {source,installed}=require('./scripts/rust-object-import/load-source.cjs');
    const compiled=process.env.BIT_TEST_TRANSFER_COMPILED==='1';
    const base=path.dirname(installed.resolve('@teambit/export'));
    const api=compiled?require(path.join(base,'rust-export-transaction.js')):source('scopes/scope/export/rust-export-transaction.ts');
    if(compiled)require(path.join(base,'export-scope-components.js'));else source('scopes/scope/export/export-scope-components.ts');
    let requests=0;
    const load=Module._load;
    Module._load=function(name,parent,main){
      if(name==='@teambit/objects'&&/rust-export-transaction\\.(ts|js)$/.test(parent?.filename||''))return{isRustSnapshotOperation:()=>true,requestRustTransfer:async()=>{requests++;return undefined;}};
      return load.call(this,name,parent,main);
    };
    api.tryRustExportTransaction([],'same-client',true).then(value=>{require('node:assert/strict').equal(value,false);require('node:assert/strict').equal(requests,1);}).catch(error=>{console.error(error);process.exitCode=1;});
  `;
  cp.execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
});

test('lazy canonical bootstrap drives first native transaction without an explicit defining-module import', () => {
  const cp = require('node:child_process');
  const script = `
    const path=require('node:path'),assert=require('node:assert/strict');
    const {source,installed,root}=require('./scripts/rust-object-import/load-source.cjs');
    const compiled=process.env.BIT_TEST_TRANSFER_COMPILED==='1';
    const base=path.dirname(installed.resolve('@teambit/export'));
    const api=compiled?require(path.join(base,'rust-export-transaction.js')):source('scopes/scope/export/rust-export-transaction.ts');
    process.env.BIT_RUST_CLIENT_VCS='on';
    process.env.BIT_RUST_OBJECT_IMPORT=process.env.BIT_TEST_OBJECT_IMPORT||path.join(root,'native/target/debug/bit-object-import'+(process.platform==='win32'?'.exe':''));
    const objects=installed('@teambit/objects');
    const Session=require(path.join(path.dirname(installed.resolve('@teambit/component.sources')),'rust-workspace-materializer.js')).MaterializationSession;
    const request=Session.prototype.request;const frames=[];
    Session.prototype.request=function(build,...args){const bytes=build(0);if(bytes.subarray(0,4).toString()==='BMT1')frames.push(JSON.parse(bytes.subarray(12)).kind);return request.call(this,build,...args);};
    const events=[];const log=new Proxy({},{get:()=>()=>{}});
    const rows=['one.scope','two.scope'].map(name=>({remote:{name,async pushMany(){events.push('push:'+name);},async action(kind){events.push(kind+':'+name);return[name+'/component'];}},objectList:{count:()=>1}}));
    objects.withRustTransferOperation(async()=>{assert.equal(await api.tryRustExportTransaction(rows,'same-client',false,log),true);}).then(()=>{
      assert.equal(frames.filter(kind=>kind==='transferTransactionInitialize').length,1);
      assert.equal(frames.filter(kind=>kind==='transferTransactionReceipt').length,5);
      assert.deepEqual(events,['push:one.scope','push:two.scope','ExportValidate:one.scope','ExportValidate:two.scope','ExportPersist:one.scope','ExportPersist:two.scope']);
    }).catch(error=>{console.error(error);process.exitCode=1;});
  `;
  cp.execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
});

test('lost persist receipt awaits a later row replaced with a Promise before continuing', async () => {
  await scenario(4, false, true);
});

test('real native validation/persist failures preserve cleanup, resume and typed pending-state policy', () => {
  const cp = require('node:child_process');
  const script = `
    const path=require('node:path'),assert=require('node:assert/strict');
    const {source,installed,root}=require('./scripts/rust-object-import/load-source.cjs');
    const compiled=process.env.BIT_TEST_TRANSFER_COMPILED==='1';const base=path.dirname(installed.resolve('@teambit/export'));
    const api=compiled?require(path.join(base,'rust-export-transaction.js')):source('scopes/scope/export/rust-export-transaction.ts');
    process.env.BIT_RUST_CLIENT_VCS='on';process.env.BIT_RUST_OBJECT_IMPORT=process.env.BIT_TEST_OBJECT_IMPORT||path.join(root,'native/target/debug/bit-object-import'+(process.platform==='win32'?'.exe':''));
    const objects=installed('@teambit/objects'),{PersistFailed}=installed('@teambit/legacy.scope');
    const Session=require(path.join(path.dirname(installed.resolve('@teambit/component.sources')),'rust-workspace-materializer.js')).MaterializationSession;
    const original=Session.prototype.request;const log=new Proxy({},{get:()=>()=>{}});
    (async()=>{for(const scenario of ['fresh-validation','resume-validation','persist-failure']){
      const events=[],failure=new Error(scenario);let lostCleanup=false;
      Session.prototype.request=function(build,...args){const bytes=build(0);const input=JSON.parse(bytes.subarray(12));if(scenario==='fresh-validation'&&input.kind==='transferTransactionReceipt'&&input.revision===3){lostCleanup=true;return Promise.resolve(undefined);}return original.call(this,build,...args);};
      const rows=['one.scope','two.scope'].map((name,index)=>({remote:{name,async pushMany(){events.push('push:'+name);},async action(kind){events.push(kind+':'+name);if(index===1&&((scenario.includes('validation')&&kind==='ExportValidate')||(scenario==='persist-failure'&&kind==='ExportPersist')))throw failure;return[name+'/component'];}},objectList:{count:()=>1}}));
      await assert.rejects(objects.withRustTransferOperation(()=>api.tryRustExportTransaction(rows,'same-client',scenario==='resume-validation',log)),error=>scenario==='persist-failure'?error instanceof PersistFailed:error===failure);
      const cleanups=events.filter(item=>item.startsWith('RemovePendingDir:'));
      if(scenario==='fresh-validation'){assert.deepEqual(cleanups,['RemovePendingDir:one.scope','RemovePendingDir:two.scope']);assert.equal(lostCleanup,true);}
      else assert.deepEqual(cleanups,[]);
      if(scenario==='resume-validation')assert.equal(events.filter(item=>item.startsWith('push:')).length,0);
      if(scenario==='persist-failure'){assert.equal(events.filter(item=>item==='ExportPersist:one.scope').length,1);assert.equal(events.filter(item=>item==='ExportPersist:two.scope').length,3);assert.deepEqual(rows[0].exportedIds,['one.scope/component']);assert.equal(rows[1].exportedIds,undefined);}
    }} )().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  cp.execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
});
