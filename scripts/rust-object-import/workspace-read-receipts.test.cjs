const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { installed } = require('./load-source.cjs');
const sources = installed('@teambit/component.sources');
const reader = installed('@teambit/component.sources/dist/rust-workspace-reader.js');
const identity = installed('@teambit/component.sources/dist/rust-workspace-identity.js');

async function fixture(t) {
  assert.ok(process.env.BIT_TEST_OBJECT_IMPORT, 'actual compiled helper required');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-receipt-'));
  const filename = path.join(directory, 'index.js');
  await fs.writeFile(filename, '\ufefforiginal\r\n');
  const previous = {
    BIT_RUST_CLIENT_VCS: process.env.BIT_RUST_CLIENT_VCS,
    BIT_RUST_OBJECT_IMPORT: process.env.BIT_RUST_OBJECT_IMPORT,
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  t.after(async () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, filename };
}
function fileFrom(read, directory) {
  const file = new sources.SourceFile({ base: directory, path: read.path, contents: read.contents });
  sources.registerRustWorkspaceFile(file, read);
  return file;
}

test('workspace read receipts survive ordinary clones and reject another operation owner', async (t) => {
  const { directory, filename } = await fixture(t);
  let escaped;
  await sources.withRustWorkspaceEngine(async () => {
    const [read] = await reader.readRustWorkspaceFiles([filename]);
    const file = fileFrom(read, directory);
    const token = identity.getRustWorkspaceMergeDescriptor(file).readToken;
    assert.ok(Number.isSafeInteger(token));
    const clone = file.clone();
    assert.equal(identity.getRustWorkspaceMergeDescriptor(clone).readToken, token);
    const descendant = clone.clone();
    clone.contents = Buffer.from('replacement');
    assert.equal(identity.getRustWorkspaceMergeDescriptor(clone), undefined);
    assert.equal(identity.getRustWorkspaceMergeDescriptor(descendant).readToken, token);
    const firstByte = descendant.contents[0];
    descendant.contents[0] ^= 1;
    assert.equal(identity.getRustWorkspaceMergeDescriptor(descendant), undefined);
    assert.equal(identity.getRustWorkspaceMergeDescriptor(file), undefined);
    descendant.contents[0] = firstByte;
    descendant.path = path.join(directory, 'renamed.js');
    assert.equal(identity.getRustWorkspaceMergeDescriptor(descendant), undefined);
    assert.equal(identity.getRustWorkspaceMergeDescriptor(file).readToken, token);
    await fs.rm(filename);
    assert.equal(identity.getRustWorkspaceMergeDescriptor(file).readToken, token);
    escaped = file;
  });
  await sources.withRustWorkspaceEngine(async () => {
    assert.equal(identity.getRustWorkspaceMergeDescriptor(escaped).readToken, undefined);
  });
});

test('copied or mutated read records cannot mint native workspace ownership', async (t) => {
  const { directory, filename } = await fixture(t);
  await sources.withRustWorkspaceEngine(async () => {
    const [read] = await reader.readRustWorkspaceFiles([filename]);
    assert.equal(reader.getRustWorkspaceReadReceipt({ ...read }), undefined);
    assert.equal(identity.getRustWorkspaceMergeDescriptor(fileFrom({ ...read }, directory)).readToken, undefined);
    const original = read.contents[0];
    read.contents[0] ^= 1;
    assert.equal(reader.getRustWorkspaceReadReceipt(read), undefined);
    read.contents[0] = original;
    assert.ok(reader.getRustWorkspaceReadReceipt(read));
    const file = fileFrom(read, directory);
    file.contents[0] ^= 1;
    assert.equal(identity.getRustWorkspaceMergeDescriptor(file), undefined);
  });
});

test('receipt inspection rejects getters and replaced lookup functions without invoking them', async (t) => {
  const { directory, filename } = await fixture(t);
  await sources.withRustWorkspaceEngine(async () => {
    const [read] = await reader.readRustWorkspaceFiles([filename]);
    const field = Object.getOwnPropertyDescriptor(read, 'path');
    let calls = 0;
    Object.defineProperty(read, 'path', {
      configurable: true,
      get() {
        calls++;
        return filename;
      },
    });
    assert.equal(reader.getRustWorkspaceReadReceipt(read), undefined);
    assert.equal(calls, 0);
    Object.defineProperty(read, 'path', field);
    const getter = Object.getOwnPropertyDescriptor(reader, 'getRustWorkspaceReadReceipt');
    Object.defineProperty(reader, 'getRustWorkspaceReadReceipt', {
      configurable: true,
      get() {
        calls++;
        return getter.value;
      },
    });
    try {
      assert.equal(identity.getRustWorkspaceMergeDescriptor(fileFrom(read, directory)).readToken, undefined);
      assert.equal(calls, 0);
    } finally {
      Object.defineProperty(reader, 'getRustWorkspaceReadReceipt', getter);
    }
  });
});
