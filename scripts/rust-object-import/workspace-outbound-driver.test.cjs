const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');

const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));

const options = { ids: ['qualification.alpha/alpha'], originDirectly: true };
const receipt = {
  token: 'held',
  owner: 'rust',
  componentsIds: ['qualification.alpha/alpha'],
  newIdsOnRemote: ['qualification.alpha/alpha@1.0.0'],
  nonExistOnBitMap: [],
  removedIds: [],
  missingScope: [],
  exportedLanes: [],
  rippleJobUrls: [],
  applied: true,
};

test('outbound parser admits staged, scoped, and unique short-name export', () => {
  const { parseRustWorkspaceOutbound: parse } = load('rust-workspace-outbound-options');
  assert.deepEqual(parse(['export']), { ids: [], originDirectly: false });
  assert.deepEqual(parse(['e', '--origin-directly', 'qualification.alpha/alpha']), options);
  assert.deepEqual(parse(['export', 'qualification.alpha/alpha@1.0.0']), {
    ids: ['qualification.alpha/alpha@1.0.0'],
    originDirectly: false,
  });
  assert.deepEqual(parse(['export', 'alpha']), { ids: ['alpha'], originDirectly: false });
  for (const args of [
    ['export', '*'],
    ['export', '--json'],
    ['export', '--all'],
    ['export', '--origin-directly', '--origin-directly'],
    ['export', '--head-only'],
    ['export', '--ignore-missing-artifacts'],
    ['export', '--eject'],
    ['export', '--resume'],
  ])
    assert.equal(parse(args), undefined, args.join(' '));
});

test('outbound receipt accepts scalar identities and rejects invalid publication', () => {
  const { validateRustOutboundReceipt: validate } = load('rust-workspace-outbound-report');
  assert.deepEqual(validate(receipt), receipt);
  for (const invalid of [
    { ...receipt, owner: 'node' },
    { ...receipt, componentsIds: ['alpha'] },
    { ...receipt, componentsIds: [receipt.componentsIds[0], receipt.componentsIds[0]] },
    { ...receipt, newIdsOnRemote: ['qualification.alpha/other@1.0.0'] },
    { ...receipt, newIdsOnRemote: ['qualification.alpha/alpha'] },
    { ...receipt, exportedLanes: ['qualification.alpha/dev'] },
    { ...receipt, rippleJobUrls: ['https://example.test/job'] },
  ])
    assert.throws(() => validate(invalid));
});

test('outbound report uses the public ExportCmd renderer', async () => {
  const { formatRustWorkspaceOutbound: format } = load('rust-workspace-outbound-report');
  const { ExportCmd } = installed('@teambit/export/dist/export-cmd.js');
  const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
  const result = {
    componentsIds: [ComponentID.fromString('qualification.alpha/alpha')],
    newIdsOnRemote: [ComponentID.fromString('qualification.alpha/alpha@1.0.0')],
    nonExistOnBitMap: [],
    removedIds: ComponentIdList.fromArray([]),
    missingScope: [],
    exportedLanes: [],
    ejectResults: undefined,
    rippleJobs: [],
    rippleJobUrls: [],
  };
  const canonical = new ExportCmd({ export: async () => result });
  assert.equal(await format(receipt, options), await canonical.report([options.ids], { originDirectly: true }));
});

test('outbound driver validates before publication and propagates failures after apply', async (t) => {
  const capture = load('rust-client-capture');
  const original = capture.withRustClientRequest;
  t.after(() => {
    capture.withRustClientRequest = original;
  });
  const events = [];
  let failApply = false;
  let clientId;
  capture.withRustClientRequest = async (callback, propagate) => {
    try {
      return await callback(async (input) => {
        events.push(input.kind);
        if (input.kind === 'commandOutboundPrepare') {
          clientId = input.clientId;
          return { token: 'held', owner: 'rust', nothingToExport: true, scopes: [], fileRemote: false };
        }
        if (failApply) throw new Error('failed after outbound apply');
        if (input.kind === 'commandOutboundApply')
          return { token: 'held', owner: 'rust', pending: false, scopes: [], clientId, objectCount: 0 };
        return { ...receipt, componentsIds: [], newIdsOnRemote: [] };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  };
  const { readRustWorkspaceOutbound: read } = load('rust-workspace-outbound');
  const report = await read('/workspace', '/home', options, async () => {
    events.push('beforeCommit');
  });
  assert.equal(typeof report, 'string');
  assert.deepEqual(events, [
    'commandOutboundPrepare',
    'beforeCommit',
    'commandOutboundApply',
    'commandOutboundFinalize',
  ]);
  failApply = true;
  await assert.rejects(read('/workspace', '/home', options), /failed after outbound apply/);
});

test('registered persist hook declines file transfer before commit while HTTP remains native', async (t) => {
  const capture = load('rust-client-capture');
  const original = capture.withRustClientRequest;
  const { ExportPersist } = installed('@teambit/scope.remote-actions');
  const originalHook = ExportPersist.onPutHook;
  t.after(() => {
    capture.withRustClientRequest = original;
    ExportPersist.onPutHook = originalHook;
  });
  ExportPersist.onPutHook = async () => {};
  const events = [];
  capture.withRustClientRequest = async (callback) =>
    callback(async (input) => {
      events.push(input.kind);
      if (input.kind === 'commandOutboundPrepare')
        return { token: 'held', owner: 'rust', nothingToExport: false, scopes: ['qualification.alpha'], fileRemote: true };
      throw new Error(`unexpected native transfer: ${input.kind}`);
    });
  const { readRustWorkspaceOutbound: read } = load('rust-workspace-outbound');
  const result = await read('/workspace', '/home', options, async () => events.push('beforeCommit'));
  assert.equal(result, undefined);
  assert.deepEqual(events, ['commandOutboundPrepare']);

  events.length = 0;
  let clientId;
  capture.withRustClientRequest = async (callback) =>
    callback(async (input) => {
      events.push(input.kind);
      if (input.kind === 'commandOutboundPrepare') {
        clientId = input.clientId;
        return { token: 'held', owner: 'rust', nothingToExport: false, scopes: ['qualification.alpha'], fileRemote: false };
      }
      if (input.kind === 'commandOutboundApply')
        return { token: 'held', owner: 'rust', pending: true, scopes: ['qualification.alpha'], clientId, objectCount: 1 };
      return receipt;
    });
  assert.equal(typeof (await read('/workspace', '/home', options, async () => events.push('beforeCommit'))), 'string');
  assert.deepEqual(events, [
    'commandOutboundPrepare',
    'beforeCommit',
    'commandOutboundApply',
    'commandOutboundFinalize',
  ]);
});
