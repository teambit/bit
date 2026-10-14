const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));

const receipt = {
  token: 'held',
  owner: 'rust',
  importedIds: ['qualification.alpha/alpha@1.0.0'],
  progress: [],
  importDetails: [
    {
      id: 'qualification.alpha/alpha',
      versions: ['1.0.0'],
      latestVersion: '1.0.0',
      status: 'added',
      filesStatus: null,
      missingDeps: [],
      deprecated: false,
    },
  ],
};

test('ordinary inbound parser accepts selected/default object transfer and leaves other modes canonical', () => {
  const { parseRustWorkspaceInbound: parse } = load('rust-workspace-inbound-options');
  assert.deepEqual(parse(['fetch', 'qualification.alpha/alpha', '--components']), {
    operation: 'fetch',
    ids: ['qualification.alpha/alpha'],
    objectsOnly: true,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  });
  assert.deepEqual(parse(['fetch', '-c', '--all-history']), {
    operation: 'fetch',
    ids: [],
    objectsOnly: true,
    allHistory: true,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  });
  assert.deepEqual(parse(['import', 'qualification.alpha/alpha', '-o']), {
    operation: 'import',
    ids: ['qualification.alpha/alpha'],
    objectsOnly: true,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  });
  assert.deepEqual(parse(['import']), {
    operation: 'import',
    ids: [],
    objectsOnly: true,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  });
  assert.deepEqual(parse(['import', 'qualification.alpha/alpha', '-x']), {
    operation: 'import',
    ids: ['qualification.alpha/alpha'],
    objectsOnly: false,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: true,
  });
  for (const args of [
    ['fetch'],
    ['fetch', '--lanes'],
    ['fetch', '-c', '--components'],
    ['fetch', '-c', '--json'],
    ['fetch', '-c', '--from-original-scopes'],
    ['import', 'qualification.alpha/alpha'],
    ['import', '--merge'],
    ['import', '-o', '--objects'],
    ['import', '--objects', '--override'],
    ['import', '--objects', '--json'],
  ])
    assert.equal(parse(args), undefined, args.join(' '));
});

test('inbound receipt admits only matched semantic identities and canonical status/details', () => {
  const { validateRustInboundReceipt: validate } = load('rust-workspace-inbound-report');
  assert.deepEqual(validate(receipt), receipt);
  for (const invalid of [
    { ...receipt, owner: 'node' },
    { ...receipt, importedIds: ['qualification.alpha/alpha'] },
    { ...receipt, importedIds: [receipt.importedIds[0], receipt.importedIds[0]] },
    { ...receipt, importDetails: [{ ...receipt.importDetails[0], status: 'invalid' }] },
    { ...receipt, importDetails: [{ ...receipt.importDetails[0], id: 'qualification.beta/beta' }] },
    { ...receipt, importDetails: [{ ...receipt.importDetails[0], missingDeps: ['qualification.beta/beta'] }] },
  ])
    assert.throws(() => validate(invalid));
});

test('inbound report is rendered by the public FetchCmd and ImportCmd', async () => {
  const { formatRustWorkspaceInbound: format } = load('rust-workspace-inbound-report');
  const { FetchCmd } = installed('@teambit/importer/dist/fetch-cmd.js');
  const { ImportCmd } = installed('@teambit/importer/dist/import.cmd.js');
  const { ComponentID } = installed('@teambit/component-id');
  const importedIds = receipt.importedIds.map((text) => ComponentID.fromString(text));
  const options = (operation) => ({
    operation,
    ids: ['qualification.alpha/alpha'],
    objectsOnly: true,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  });
  const canonicalFetch = new FetchCmd({ fetch: async () => ({ importedIds, importDetails: receipt.importDetails }) });
  assert.equal(
    await format(receipt, options('fetch')),
    await canonicalFetch.report([options('fetch').ids], { components: true })
  );
  const canonicalImport = new ImportCmd({
    logger: { warn() {} },
    import: async () => ({ importedIds, importDetails: receipt.importDetails, importedDeps: [], missingIds: [] }),
  });
  assert.equal(
    await format(receipt, options('import')),
    await canonicalImport.report([options('import').ids], { objects: true })
  );
  const empty = { ...receipt, importedIds: [], importDetails: [] };
  const emptyFetch = new FetchCmd({ fetch: async () => ({ importedIds: [], importDetails: [] }) });
  const emptyImport = new ImportCmd({
    logger: { warn() {} },
    import: async () => ({ importedIds: [], importDetails: [], importedDeps: [], missingIds: [] }),
  });
  assert.equal(await format(empty, options('fetch')), await emptyFetch.report([[]], { components: true }));
  assert.equal(await format(empty, options('import')), await emptyImport.report([[]], { objects: true }));
});

test('inbound driver formats before publication and never falls back after apply begins', async (t) => {
  const capture = load('rust-client-capture');
  const original = capture.withRustClientRequest;
  t.after(() => {
    capture.withRustClientRequest = original;
  });
  const events = [];
  let failure = false;
  capture.withRustClientRequest = async (callback, propagate) => {
    try {
      return await callback(async (input) => {
        events.push(input.kind);
        if (input.kind === 'commandInboundPrepare') return receipt;
        if (failure) throw new Error('failed after apply');
        return { ...receipt, applied: true };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  };
  const { readRustWorkspaceInbound: read } = load('rust-workspace-inbound');
  const options = {
    operation: 'fetch',
    ids: ['qualification.alpha/alpha'],
    objectsOnly: true,
    allHistory: false,
    fromOriginalScope: false,
    skipDependencyInstallation: false,
  };
  const report = await read('/workspace', '/home', options, async () => {
    events.push('beforeCommit');
  });
  assert.equal(typeof report, 'string');
  assert.deepEqual(events, ['commandInboundPrepare', 'beforeCommit', 'commandInboundApply']);
  failure = true;
  await assert.rejects(
    read('/workspace', '/home', options, async () => {}),
    /failed after apply/
  );
});
